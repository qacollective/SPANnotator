using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using SPANnotator.Services;

namespace SPANnotator.Controllers
{
    [ApiController]
    [Route("api/auth")]
    public class AuthController : ControllerBase
    {
        private readonly IAuthService _authService;
        private readonly ILogger<AuthController> _logger;

        public AuthController(IAuthService authService, ILogger<AuthController> logger)
        {
            _authService = authService;
            _logger = logger;
        }

        /// <summary>
        /// The list of names an annotator can pick from in "simple" auth mode. Never includes
        /// PIN hashes/salts - only what the identity-picker UI needs to render.
        /// </summary>
        [HttpGet("users")]
        public async Task<IActionResult> GetUsers()
        {
            var settings = await _authService.GetAuthSettingsAsync();

            if (settings.Mode != AuthMode.Simple)
            {
                return Ok(new { authMode = settings.Mode.ToString().ToLowerInvariant(), requirePin = false, users = Array.Empty<object>() });
            }

            var users = await _authService.GetUsersAsync();

            return Ok(new
            {
                authMode = "simple",
                requirePin = settings.RequirePin,
                users = users.Select(u => new { username = u.Username, displayName = u.DisplayName, hasPin = !string.IsNullOrEmpty(u.PinHash) })
            });
        }

        /// <summary>
        /// Who the server currently thinks is making the request, under whatever auth mode is active.
        /// </summary>
        [HttpGet("me")]
        public async Task<IActionResult> Me()
        {
            var username = await _authService.GetCurrentUsernameAsync(HttpContext);
            if (username == null)
            {
                return Ok(new { authenticated = false });
            }

            var displayName = await _authService.GetCurrentDisplayNameAsync(HttpContext);
            return Ok(new { authenticated = true, username, displayName = displayName ?? username });
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            var settings = await _authService.GetAuthSettingsAsync();
            if (settings.Mode != AuthMode.Simple)
            {
                return BadRequest(new { error = "Simple sign-in is not enabled for this deployment" });
            }

            var (success, error, user) = await _authService.LoginAsync(request.Username, request.Pin);
            if (!success || user == null)
            {
                return Unauthorized(new { error = error ?? "Sign-in failed" });
            }

            var claims = new List<Claim>
            {
                new(ClaimTypes.NameIdentifier, user.Username),
                new(ClaimTypes.Name, string.IsNullOrEmpty(user.DisplayName) ? user.Username : user.DisplayName)
            };
            var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
            var principal = new ClaimsPrincipal(identity);

            await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal, new AuthenticationProperties
            {
                IsPersistent = true,
                ExpiresUtc = DateTimeOffset.UtcNow.AddDays(365)
            });

            _logger.LogInformation("User {Username} signed in via simple auth", user.Username);

            return Ok(new { success = true, username = user.Username, displayName = user.DisplayName });
        }

        [HttpPost("logout")]
        public async Task<IActionResult> Logout()
        {
            var settings = await _authService.GetAuthSettingsAsync();
            if (settings.Mode == AuthMode.Simple)
            {
                await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            }

            return Ok(new { success = true });
        }
    }

    public class LoginRequest
    {
        public string Username { get; set; } = string.Empty;
        public string? Pin { get; set; }
    }
}
