using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SPANnotator.Services
{
    public enum AuthMode
    {
        None,
        Windows,
        Simple
    }

    public class AuthSettings
    {
        public AuthMode Mode { get; set; } = AuthMode.None;
        public bool RequirePin { get; set; } = true;
    }

    public class UserAccount
    {
        [JsonPropertyName("username")]
        public string Username { get; set; } = string.Empty;

        [JsonPropertyName("displayName")]
        public string DisplayName { get; set; } = string.Empty;

        [JsonPropertyName("pinSalt")]
        public string? PinSalt { get; set; }

        [JsonPropertyName("pinHash")]
        public string? PinHash { get; set; }
    }

    public class UsersFile
    {
        [JsonPropertyName("users")]
        public List<UserAccount> Users { get; set; } = new();
    }

    /// <summary>
    /// Resolves the current annotator's identity for whichever authentication mode
    /// config.json's globalSettings.authMode selects, and owns users.json for "simple" mode.
    /// </summary>
    public interface IAuthService
    {
        Task<AuthSettings> GetAuthSettingsAsync();
        Task<List<UserAccount>> GetUsersAsync();
        Task<(bool success, string? error, UserAccount? user)> LoginAsync(string username, string? pin);

        /// <summary>
        /// Returns the acting user's username, or null when authMode is "simple" and no one
        /// has signed in yet on this browser/session. Windows and None modes always resolve
        /// to a username (matching the tool's pre-existing behaviour).
        /// </summary>
        Task<string?> GetCurrentUsernameAsync(HttpContext context);
        Task<string?> GetCurrentDisplayNameAsync(HttpContext context);
    }

    public class AuthService : IAuthService
    {
        private const int PinIterations = 100_000;
        private const int PinHashLength = 32;

        private readonly IWebHostEnvironment _environment;
        private readonly ILogger<AuthService> _logger;
        private static readonly SemaphoreSlim _usersFileLock = new(1, 1);

        public AuthService(IWebHostEnvironment environment, ILogger<AuthService> logger)
        {
            _environment = environment;
            _logger = logger;
        }

        private string ConfigPath => Path.Combine(_environment.WebRootPath ?? _environment.ContentRootPath, "config.json");

        private string UsersPath => Path.Combine(_environment.ContentRootPath, "users.json");

        public async Task<AuthSettings> GetAuthSettingsAsync()
        {
            var settings = new AuthSettings();

            try
            {
                if (!File.Exists(ConfigPath))
                {
                    return settings;
                }

                var json = await File.ReadAllTextAsync(ConfigPath);
                using var doc = JsonDocument.Parse(json);

                if (!doc.RootElement.TryGetProperty("globalSettings", out var globalSettings))
                {
                    // Backward-compatible top-level fallback (pre-dates globalSettings existing at all)
                    if (doc.RootElement.TryGetProperty("useWindowsAuthentication", out var legacyTopLevel) && legacyTopLevel.GetBoolean())
                    {
                        settings.Mode = AuthMode.Windows;
                    }
                    return settings;
                }

                if (globalSettings.TryGetProperty("authMode", out var authModeProp) && authModeProp.ValueKind == JsonValueKind.String)
                {
                    settings.Mode = authModeProp.GetString()?.Trim().ToLowerInvariant() switch
                    {
                        "windows" => AuthMode.Windows,
                        "simple" => AuthMode.Simple,
                        "none" => AuthMode.None,
                        _ => AuthMode.None
                    };
                }
                else if (globalSettings.TryGetProperty("useWindowsAuthentication", out var legacyNested))
                {
                    // Backward-compatible: the old boolean flag maps onto the new authMode field.
                    settings.Mode = legacyNested.GetBoolean() ? AuthMode.Windows : AuthMode.None;
                }

                if (globalSettings.TryGetProperty("requirePin", out var requirePinProp) && requirePinProp.ValueKind is JsonValueKind.True or JsonValueKind.False)
                {
                    settings.RequirePin = requirePinProp.GetBoolean();
                }

                return settings;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read auth settings from config.json; defaulting to no authentication");
                return settings;
            }
        }

        public async Task<List<UserAccount>> GetUsersAsync()
        {
            var file = await LoadUsersFileAsync();
            return file.Users;
        }

        public async Task<(bool success, string? error, UserAccount? user)> LoginAsync(string username, string? pin)
        {
            if (string.IsNullOrWhiteSpace(username))
            {
                return (false, "Please choose a name", null);
            }

            var settings = await GetAuthSettingsAsync();

            await _usersFileLock.WaitAsync();
            try
            {
                var file = await LoadUsersFileAsync();
                var user = file.Users.FirstOrDefault(u => string.Equals(u.Username, username, StringComparison.OrdinalIgnoreCase));

                if (user == null)
                {
                    return (false, "That name isn't in users.json", null);
                }

                if (!settings.RequirePin)
                {
                    return (true, null, user);
                }

                if (string.IsNullOrWhiteSpace(pin))
                {
                    return (false, "A PIN is required", null);
                }

                if (string.IsNullOrEmpty(user.PinHash) || string.IsNullOrEmpty(user.PinSalt))
                {
                    // First sign-in for this user: whatever PIN they enter now becomes their PIN.
                    var (hash, salt) = HashPin(pin);
                    user.PinHash = hash;
                    user.PinSalt = salt;
                    await SaveUsersFileAsync(file);
                    _logger.LogInformation("PIN set for user {Username} on first sign-in", user.Username);
                    return (true, null, user);
                }

                if (!VerifyPin(pin, user.PinHash, user.PinSalt))
                {
                    return (false, "Incorrect PIN", null);
                }

                return (true, null, user);
            }
            finally
            {
                _usersFileLock.Release();
            }
        }

        public async Task<string?> GetCurrentUsernameAsync(HttpContext context)
        {
            var settings = await GetAuthSettingsAsync();

            switch (settings.Mode)
            {
                case AuthMode.Windows:
                    if (context.User?.Identity?.IsAuthenticated == true && !string.IsNullOrEmpty(context.User.Identity.Name))
                    {
                        var name = context.User.Identity.Name;
                        return name.Contains('\\') ? name.Split('\\').Last() : name;
                    }
                    return Environment.UserName ?? "unknown";

                case AuthMode.Simple:
                    if (context.User?.Identity?.IsAuthenticated == true)
                    {
                        return context.User.FindFirstValue(ClaimTypes.NameIdentifier);
                    }
                    return null;

                default:
                    return Environment.UserName ?? "unknown";
            }
        }

        public async Task<string?> GetCurrentDisplayNameAsync(HttpContext context)
        {
            var settings = await GetAuthSettingsAsync();

            if (settings.Mode == AuthMode.Simple)
            {
                if (context.User?.Identity?.IsAuthenticated == true)
                {
                    return context.User.FindFirstValue(ClaimTypes.Name);
                }
                return null;
            }

            return await GetCurrentUsernameAsync(context);
        }

        private async Task<UsersFile> LoadUsersFileAsync()
        {
            if (!File.Exists(UsersPath))
            {
                return new UsersFile();
            }

            try
            {
                var json = await File.ReadAllTextAsync(UsersPath);
                if (string.IsNullOrWhiteSpace(json))
                {
                    return new UsersFile();
                }

                return JsonSerializer.Deserialize<UsersFile>(json) ?? new UsersFile();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read users.json; treating as empty");
                return new UsersFile();
            }
        }

        private async Task SaveUsersFileAsync(UsersFile file)
        {
            var json = JsonSerializer.Serialize(file, new JsonSerializerOptions { WriteIndented = true });
            await File.WriteAllTextAsync(UsersPath, json);
        }

        private static (string hash, string salt) HashPin(string pin)
        {
            var saltBytes = RandomNumberGenerator.GetBytes(16);
            var hashBytes = Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(pin), saltBytes, PinIterations, HashAlgorithmName.SHA256, PinHashLength);
            return (Convert.ToBase64String(hashBytes), Convert.ToBase64String(saltBytes));
        }

        private static bool VerifyPin(string pin, string storedHash, string storedSalt)
        {
            var saltBytes = Convert.FromBase64String(storedSalt);
            var expected = Convert.FromBase64String(storedHash);
            var actual = Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(pin), saltBytes, PinIterations, HashAlgorithmName.SHA256, PinHashLength);
            return CryptographicOperations.FixedTimeEquals(expected, actual);
        }
    }
}
