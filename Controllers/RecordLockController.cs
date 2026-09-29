using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using System.Collections.Concurrent;
using SPANnotator.Services;

namespace SPANnotator.Controllers
{
    [ApiController]
    [Route("api/record-lock")]
    public class RecordLockController : ControllerBase
    {
        private readonly IWebHostEnvironment _environment;
        private readonly ILogger<RecordLockController> _logger;
        private readonly IAuthService _authService;
        private static readonly SemaphoreSlim _lockFileSemaphore = new(1, 1);

        // In-memory cache for better performance
        private static readonly ConcurrentDictionary<string, Dictionary<string, RecordLock>> _lockCache = new();

        public RecordLockController(IWebHostEnvironment environment, ILogger<RecordLockController> logger, IAuthService authService)
        {
            _environment = environment;
            _logger = logger;
            _authService = authService;
        }

        [HttpPost("acquire")]
        public async Task<IActionResult> AcquireLock([FromBody] AcquireLockRequest request)
        {
            try
            {
                if (string.IsNullOrEmpty(request.RecordId) || string.IsNullOrEmpty(request.Corpus))
                {
                    return BadRequest(new { error = "RecordId and Corpus are required" });
                }

                var username = await _authService.GetCurrentUsernameAsync(HttpContext);
                if (username == null)
                {
                    return Unauthorized(new { error = "Please sign in before annotating" });
                }

                var locks = await LoadLocks(request.Corpus);

                // Clean up expired locks
                CleanupExpiredLocks(locks);

                // Check if record is already locked by another user
                if (locks.TryGetValue(request.RecordId, out var existingLock))
                {
                    if (existingLock.Username != username && existingLock.ExpiresAt > DateTime.UtcNow)
                    {
                        return Conflict(new {
                            error = "Record is locked by another user",
                            lockedBy = existingLock.Username,
                            expiresAt = existingLock.ExpiresAt
                        });
                    }
                }

                // Acquire or refresh the lock
                var newLock = new RecordLock
                {
                    RecordId = request.RecordId,
                    Username = username,
                    Corpus = request.Corpus,
                    LockedAt = DateTime.UtcNow,
                    ExpiresAt = DateTime.UtcNow.AddMinutes(10) // 10-minute lock
                };

                locks[request.RecordId] = newLock;
                await SaveLocks(request.Corpus, locks);

                _logger.LogInformation("Record {RecordId} locked by {Username} in corpus {Corpus}",
                    request.RecordId, username, request.Corpus);

                return Ok(new { success = true, expiresAt = newLock.ExpiresAt });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to acquire lock for record {RecordId}", request.RecordId);
                return StatusCode(500, new { error = $"Failed to acquire lock: {ex.Message}" });
            }
        }

        [HttpPost("release")]
        public async Task<IActionResult> ReleaseLock([FromBody] ReleaseLockRequest request)
        {
            try
            {
                if (string.IsNullOrEmpty(request.RecordId) || string.IsNullOrEmpty(request.Corpus))
                {
                    return BadRequest(new { error = "RecordId and Corpus are required" });
                }

                var username = await _authService.GetCurrentUsernameAsync(HttpContext);
                if (username == null)
                {
                    return Unauthorized(new { error = "Please sign in before releasing a lock" });
                }

                var locks = await LoadLocks(request.Corpus);

                if (locks.TryGetValue(request.RecordId, out var existingLock))
                {
                    // Only allow the lock owner to release it
                    if (existingLock.Username == username)
                    {
                        locks.Remove(request.RecordId);
                        await SaveLocks(request.Corpus, locks);

                        _logger.LogInformation("Record {RecordId} unlocked by {Username} in corpus {Corpus}",
                            request.RecordId, username, request.Corpus);
                    }
                    else
                    {
                        return StatusCode(403, new { error = "You can only release locks you own" });
                    }
                }

                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to release lock for record {RecordId}", request.RecordId);
                return StatusCode(500, new { error = $"Failed to release lock: {ex.Message}" });
            }
        }

        [HttpPost("refresh")]
        public async Task<IActionResult> RefreshLock([FromBody] RefreshLockRequest request)
        {
            try
            {
                if (string.IsNullOrEmpty(request.RecordId) || string.IsNullOrEmpty(request.Corpus))
                {
                    return BadRequest(new { error = "RecordId and Corpus are required" });
                }

                var username = await _authService.GetCurrentUsernameAsync(HttpContext);
                if (username == null)
                {
                    return Unauthorized(new { error = "Please sign in before refreshing a lock" });
                }

                var locks = await LoadLocks(request.Corpus);

                if (locks.TryGetValue(request.RecordId, out var existingLock))
                {
                    if (existingLock.Username == username)
                    {
                        existingLock.ExpiresAt = DateTime.UtcNow.AddMinutes(10);
                        await SaveLocks(request.Corpus, locks);

                        return Ok(new { success = true, expiresAt = existingLock.ExpiresAt });
                    }
                    else
                    {
                        return StatusCode(403, new { error = "You can only refresh locks you own" });
                    }
                }

                return NotFound(new { error = "Lock not found" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to refresh lock for record {RecordId}", request.RecordId);
                return StatusCode(500, new { error = $"Failed to refresh lock: {ex.Message}" });
            }
        }

        [HttpGet("status/{corpus}/{recordId}")]
        public async Task<IActionResult> GetLockStatus(string corpus, string recordId)
        {
            try
            {
                var locks = await LoadLocks(corpus);
                CleanupExpiredLocks(locks);

                if (locks.TryGetValue(recordId, out var lockInfo))
                {
                    return Ok(new {
                        isLocked = true,
                        lockedBy = lockInfo.Username,
                        expiresAt = lockInfo.ExpiresAt
                    });
                }

                return Ok(new { isLocked = false });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get lock status for record {RecordId}", recordId);
                return StatusCode(500, new { error = $"Failed to get lock status: {ex.Message}" });
            }
        }

        [HttpGet("all/{corpus}")]
        public async Task<IActionResult> GetAllLocks(string corpus)
        {
            try
            {
                var locks = await LoadLocks(corpus);
                CleanupExpiredLocks(locks);

                var activeLocks = locks.Values.Select(l => new {
                    recordId = l.RecordId,
                    username = l.Username,
                    lockedAt = l.LockedAt,
                    expiresAt = l.ExpiresAt
                }).ToList();

                return Ok(activeLocks);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get all locks for corpus {Corpus}", corpus);
                return StatusCode(500, new { error = $"Failed to get locks: {ex.Message}" });
            }
        }

        private async Task<Dictionary<string, RecordLock>> LoadLocks(string corpus)
        {
            await _lockFileSemaphore.WaitAsync();
            try
            {
                // Check cache first
                if (_lockCache.TryGetValue(corpus, out var cachedLocks))
                {
                    return new Dictionary<string, RecordLock>(cachedLocks);
                }

                var lockFilePath = GetLockFilePath(corpus);
                if (!System.IO.File.Exists(lockFilePath))
                {
                    var emptyLocks = new Dictionary<string, RecordLock>();
                    _lockCache[corpus] = emptyLocks;
                    return emptyLocks;
                }

                var json = await System.IO.File.ReadAllTextAsync(lockFilePath);
                var locks = JsonSerializer.Deserialize<Dictionary<string, RecordLock>>(json) ?? new Dictionary<string, RecordLock>();

                _lockCache[corpus] = locks;
                return new Dictionary<string, RecordLock>(locks);
            }
            finally
            {
                _lockFileSemaphore.Release();
            }
        }

        private async Task SaveLocks(string corpus, Dictionary<string, RecordLock> locks)
        {
            await _lockFileSemaphore.WaitAsync();
            try
            {
                var lockFilePath = GetLockFilePath(corpus);
                var directory = Path.GetDirectoryName(lockFilePath);

                if (!Directory.Exists(directory))
                {
                    Directory.CreateDirectory(directory!);
                }

                var json = JsonSerializer.Serialize(locks, new JsonSerializerOptions { WriteIndented = true });
                await System.IO.File.WriteAllTextAsync(lockFilePath, json);

                // Update cache
                _lockCache[corpus] = new Dictionary<string, RecordLock>(locks);
            }
            finally
            {
                _lockFileSemaphore.Release();
            }
        }

        private string GetLockFilePath(string corpus)
        {
            var sanitizedCorpus = string.Join("_", corpus.Split(Path.GetInvalidFileNameChars()));
            return Path.Combine(_environment.WebRootPath ?? _environment.ContentRootPath, "data", "locks", $"{sanitizedCorpus}_locks.json");
        }

        private void CleanupExpiredLocks(Dictionary<string, RecordLock> locks)
        {
            var now = DateTime.UtcNow;
            var expiredKeys = locks.Where(kvp => kvp.Value.ExpiresAt <= now).Select(kvp => kvp.Key).ToList();

            foreach (var key in expiredKeys)
            {
                locks.Remove(key);
                _logger.LogInformation("Cleaned up expired lock for record {RecordId}", key);
            }
        }
    }

    public class RecordLock
    {
        public string RecordId { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Corpus { get; set; } = string.Empty;
        public DateTime LockedAt { get; set; }
        public DateTime ExpiresAt { get; set; }
    }

    public class AcquireLockRequest
    {
        public string RecordId { get; set; } = string.Empty;
        public string Corpus { get; set; } = string.Empty;
    }

    public class ReleaseLockRequest
    {
        public string RecordId { get; set; } = string.Empty;
        public string Corpus { get; set; } = string.Empty;
    }

    public class RefreshLockRequest
    {
        public string RecordId { get; set; } = string.Empty;
        public string Corpus { get; set; } = string.Empty;
    }
}