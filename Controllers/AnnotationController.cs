using Microsoft.AspNetCore.Mvc;
using System.Collections.Concurrent;
using SPANnotator.Services;

namespace SPANnotator.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AnnotationController : ControllerBase
    {
        private readonly IWebHostEnvironment _environment;
        private readonly ILogger<AnnotationController> _logger;
        private readonly IAuthService _authService;

        // File locks to prevent concurrent access to CSV files
        private static readonly ConcurrentDictionary<string, SemaphoreSlim> _fileLocks = new();

        public AnnotationController(IWebHostEnvironment environment, ILogger<AnnotationController> logger, IAuthService authService)
        {
            _environment = environment;
            _logger = logger;
            _authService = authService;
        }

        [HttpPost("save")]
        public async Task<IActionResult> SaveAnnotation([FromBody] SaveAnnotationRequest request)
        {
            try
            {
                if (string.IsNullOrEmpty(request.CsvLine) || string.IsNullOrEmpty(request.OutputFile))
                {
                    return BadRequest(new { error = "Missing required parameters" });
                }

                // Get the current username
                var username = await _authService.GetCurrentUsernameAsync(HttpContext);
                if (username == null)
                {
                    return Unauthorized(new { error = "Please sign in before saving annotations" });
                }

                var fullPath = Path.Combine(_environment.WebRootPath ?? _environment.ContentRootPath, request.OutputFile);
                var directory = Path.GetDirectoryName(fullPath);

                if (!Directory.Exists(directory))
                {
                    Directory.CreateDirectory(directory!);
                }

                // Get file lock to prevent concurrent access
                var fileLock = GetFileLock(fullPath);
                await fileLock.WaitAsync();

                try
                {
                    // Create headers if file doesn't exist
                    if (!System.IO.File.Exists(fullPath))
                    {
                        var headers = "id,span,text,start,end,timestamp,username\n";
                        await System.IO.File.WriteAllTextAsync(fullPath, headers);
                    }

                    // Append the new annotation with username
                    var csvLineWithUsername = request.CsvLine + "," + EscapeCSVField(username);
                    await System.IO.File.AppendAllTextAsync(fullPath, csvLineWithUsername + "\n");

                    _logger.LogInformation("Annotation saved to {FilePath} by user {Username}", fullPath, username);

                    return Ok(new { success = true, message = "Annotation saved successfully", username = username });
                }
                finally
                {
                    fileLock.Release();
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to save annotation");
                return StatusCode(500, new { error = $"Failed to save annotation: {ex.Message}" });
            }
        }


        [HttpPost("delete")]
        public async Task<IActionResult> DeleteAnnotations([FromBody] DeleteAnnotationRequest request)
        {
            try
            {
                if (request.Annotations == null || !request.Annotations.Any() || string.IsNullOrEmpty(request.OutputFile))
                {
                    return BadRequest(new { error = "Missing required parameters" });
                }

                if (await _authService.GetCurrentUsernameAsync(HttpContext) == null)
                {
                    return Unauthorized(new { error = "Please sign in before deleting annotations" });
                }

                var fullPath = Path.Combine(_environment.WebRootPath ?? _environment.ContentRootPath, request.OutputFile);

                if (!System.IO.File.Exists(fullPath))
                {
                    return NotFound(new { error = "Output file not found" });
                }

                // Get file lock to prevent concurrent access
                var fileLock = GetFileLock(fullPath);
                await fileLock.WaitAsync();

                try
                {
                    // Read all lines from the file
                    var lines = await System.IO.File.ReadAllLinesAsync(fullPath);
                    var remainingLines = new List<string>();

                    // Keep the header
                    if (lines.Length > 0)
                    {
                        remainingLines.Add(lines[0]);
                    }

                    // Process each line and remove matching annotations
                    for (int i = 1; i < lines.Length; i++)
                    {
                        var line = lines[i];
                        var shouldDelete = false;

                        foreach (var annotation in request.Annotations)
                        {
                            if (LineMatchesAnnotation(line, annotation))
                            {
                                shouldDelete = true;
                                break;
                            }
                        }

                        if (!shouldDelete)
                        {
                            remainingLines.Add(line);
                        }
                    }

                    // Write the updated content back to the file
                    await System.IO.File.WriteAllLinesAsync(fullPath, remainingLines);

                    _logger.LogInformation("Deleted {Count} annotations from {FilePath}", request.Annotations.Count(), fullPath);

                    return Ok(new { success = true, message = $"Successfully deleted {request.Annotations.Count()} annotation(s)" });
                }
                finally
                {
                    fileLock.Release();
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to delete annotations");
                return StatusCode(500, new { error = $"Failed to delete annotations: {ex.Message}" });
            }
        }

        private SemaphoreSlim GetFileLock(string filePath)
        {
            return _fileLocks.GetOrAdd(filePath, _ => new SemaphoreSlim(1, 1));
        }

        private bool LineMatchesAnnotation(string csvLine, AnnotationData annotation)
        {
            try
            {
                var values = ParseCsvLine(csvLine);
                if (values.Count < 6) return false;

                var id = values[0]?.Trim('"');
                var span = values[1]?.Trim('"');
                var text = values[2]?.Trim('"');
                var start = values[3]?.Trim('"');
                var end = values[4]?.Trim('"');

                return id == annotation.Id &&
                       span == annotation.Span &&
                       text == annotation.Text &&
                       start == annotation.Start.ToString() &&
                       end == annotation.End.ToString();
            }
            catch
            {
                return false;
            }
        }

        private List<string> ParseCsvLine(string line)
        {
            var result = new List<string>();
            var current = "";
            var inQuotes = false;

            for (int i = 0; i < line.Length; i++)
            {
                var c = line[i];

                if (c == '"')
                {
                    if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
                    {
                        current += '"';
                        i++;
                    }
                    else
                    {
                        inQuotes = !inQuotes;
                    }
                }
                else if (c == ',' && !inQuotes)
                {
                    result.Add(current);
                    current = "";
                }
                else
                {
                    current += c;
                }
            }

            result.Add(current);
            return result;
        }

        private string EscapeCSVField(string field)
        {
            if (string.IsNullOrEmpty(field))
                return "";

            // If field contains comma, quote, or newline, wrap in quotes and escape internal quotes
            if (field.Contains(',') || field.Contains('"') || field.Contains('\n'))
            {
                return '"' + field.Replace("\"", "\"\"") + '"';
            }

            return field;
        }
    }

    public class SaveAnnotationRequest
    {
        public string CsvLine { get; set; } = string.Empty;
        public string OutputFile { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
    }

    public class DeleteAnnotationRequest
    {
        public IEnumerable<AnnotationData> Annotations { get; set; } = new List<AnnotationData>();
        public string OutputFile { get; set; } = string.Empty;
    }

    public class AnnotationData
    {
        public string Id { get; set; } = string.Empty;
        public string Span { get; set; } = string.Empty;
        public string Text { get; set; } = string.Empty;
        public int Start { get; set; }
        public int End { get; set; }
    }
}