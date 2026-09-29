using Microsoft.AspNetCore.StaticFiles;
using Microsoft.AspNetCore.Authentication.Negotiate;
using Microsoft.AspNetCore.Authentication.Cookies;
using System.Text.Json;
using SPANnotator.Services;

var builder = WebApplication.CreateBuilder(args);

// Read configuration to determine which authentication mode is active. This has to happen
// before the DI container is built because it decides which authentication handler(s) get
// registered - see Services/AuthService.cs for the per-request logic that mirrors this.
var configPath = Path.Combine(builder.Environment.WebRootPath ?? builder.Environment.ContentRootPath, "config.json");
var authMode = AuthMode.None;

try
{
    if (File.Exists(configPath))
    {
        var configJson = await File.ReadAllTextAsync(configPath);
        using var doc = JsonDocument.Parse(configJson);

        if (doc.RootElement.TryGetProperty("globalSettings", out var globalSettings))
        {
            if (globalSettings.TryGetProperty("authMode", out var authModeProp) && authModeProp.ValueKind == JsonValueKind.String)
            {
                authMode = authModeProp.GetString()?.Trim().ToLowerInvariant() switch
                {
                    "windows" => AuthMode.Windows,
                    "simple" => AuthMode.Simple,
                    _ => AuthMode.None
                };
            }
            else if (globalSettings.TryGetProperty("useWindowsAuthentication", out var nestedLegacy))
            {
                // Backward compatibility with configs written before authMode existed.
                authMode = nestedLegacy.GetBoolean() ? AuthMode.Windows : AuthMode.None;
            }
        }
        else if (doc.RootElement.TryGetProperty("useWindowsAuthentication", out var topLevelLegacy))
        {
            authMode = topLevelLegacy.GetBoolean() ? AuthMode.Windows : AuthMode.None;
        }
    }
}
catch (Exception ex)
{
    Console.WriteLine($"Warning: Could not read config.json for authentication settings: {ex.Message}");
}

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSingleton<IAuthService, AuthService>();

// Configure authentication
switch (authMode)
{
    case AuthMode.Windows:
        builder.Services.AddAuthentication("Windows")
            .AddNegotiate();
        builder.Services.AddAuthorization();
        Console.WriteLine("Windows Authentication enabled");
        break;

    case AuthMode.Simple:
        // Lightweight username + PIN sign-in backed by users.json, for deployments that can't
        // (or don't want to) rely on a Windows domain to identify annotators. See
        // Services/AuthService.cs and Controllers/AuthController.cs.
        builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
            .AddCookie(options =>
            {
                options.Cookie.Name = "SPANnotatorAuth";
                options.Cookie.HttpOnly = true;
                options.Cookie.SameSite = SameSiteMode.Lax;
                options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
                options.ExpireTimeSpan = TimeSpan.FromDays(365);
                options.SlidingExpiration = true;
                // This is an API/SPA, not a page-rendering site: on an unauthenticated request,
                // return a plain 401 instead of the default 302 redirect to a login page that
                // doesn't exist here.
                options.Events.OnRedirectToLogin = context =>
                {
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    return Task.CompletedTask;
                };
                options.Events.OnRedirectToAccessDenied = context =>
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    return Task.CompletedTask;
                };
            });
        builder.Services.AddAuthorization();
        Console.WriteLine("Simple (users.json) authentication enabled");
        break;

    default:
        Console.WriteLine("Authentication disabled (annotations are attributed to the server's OS account)");
        break;
}

// Add CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();

app.UseCors("AllowAll");

app.UseRouting();

// Configure authentication middleware
if (authMode != AuthMode.None)
{
    app.UseAuthentication();
}

app.UseAuthorization();

// UseDefaultFiles only rewrites "/" to "/index.html"; UseStaticFiles (below) is what actually
// serves it, so this has to run first in the pipeline.
app.UseDefaultFiles(new DefaultFilesOptions
{
    DefaultFileNames = { "index.html" }
});

// Configure static files with cache control
var provider = new FileExtensionContentTypeProvider();
provider.Mappings[".json"] = "application/json";

app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = provider,
    OnPrepareResponse = ctx =>
    {
        // Disable caching for CSS, JS, CSV, and JSON files
        var extension = Path.GetExtension(ctx.File.Name).ToLowerInvariant();
        if (extension == ".css" || extension == ".js" || extension == ".csv" || extension == ".json")
        {
            // Prevent caching entirely
            ctx.Context.Response.Headers.Append("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
            ctx.Context.Response.Headers.Append("Pragma", "no-cache");
            ctx.Context.Response.Headers.Append("Expires", "0");
        }
    }
});

app.MapControllers();

app.Run();
