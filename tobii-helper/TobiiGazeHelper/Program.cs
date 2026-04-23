using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using Tobii.Interaction; // Core namespace for Interaction Library
using Tobii.Interaction.Framework;

namespace TobiiGazeHelper
{
    class Program
    {
        // TCP connection to Python backend
        static TcpClient? _tcpClient;
        static NetworkStream? _stream;
        static bool _isConnected = false;
        static long _gazeDataCount = 0;

        // Frame timing for quality tracking
        static long _frameCounter = 0;
        static long _lastFrameTimeMs = 0;
        static long _maxGapMs = 0;
        static int _gapWarningCount = 0;

        // Configuration
        static int Port = 5555;
        static bool Verbose = false;

        // Interaction Library Host
        static Host? _host;
        static GazePointDataStream? _gazeStream;

        static void Main(string[] args)
        {
            Console.WriteLine();
            Console.WriteLine("============================================");
            Console.WriteLine("  GazeConnect Pro - Tobii Helper v5.0");
            Console.WriteLine("  Interaction Library Integration");
            Console.WriteLine("============================================");

            foreach (var arg in args)
            {
                if (arg == "--verbose" || arg == "-v") Verbose = true;
            }

            try
            {
                // 0. Set DPI Aware
                SetProcessDPIAware();
                Console.WriteLine("[TOBII] Set Process DPI Aware.");

                // 1. Create Host
                // The Host represents the connection to the Tobii Engine
                Console.WriteLine("[TOBII] Initializing Host...");
                _host = new Host();
                
                // 2. Create Gaze Stream — use LightlyFiltered for built-in Tobii noise reduction
                // Unfiltered raw data has too much jitter that amplifies through our pipeline,
                // causing systematic drift when magnetism locks onto the wrong key.
                Console.WriteLine("[TOBII] Creating Gaze Point Data Stream (LightlyFiltered)...");
                _gazeStream = _host.Streams.CreateGazePointDataStream(GazePointDataMode.LightlyFiltered);

                // 3. Subscribe to Data
                _gazeStream.GazePoint((x, y, timestamp) =>
                {
                    OnGazeData(x, y, timestamp);
                });

                Console.WriteLine("[TOBII] Subscribed to gaze data.");
                Console.WriteLine("[TOBII] Gaze tracking is ACTIVE.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERROR] Tobii Initialization Failed: {ex.Message}");
                Console.WriteLine("  Ensure Tobii Experience / Eye Tracking Core is running.");
                Console.WriteLine("  Try restarting the app.");
                return;
            }

            // 4. Start TCP Server (to talk to Python)
            bool running = true;
            var serverThread = new Thread(() => RunTcpServer(ref running));
            serverThread.IsBackground = true;
            serverThread.Start();

            // 5. Main Loop
            Console.WriteLine("[INFO] Running... Press Ctrl+C to exit.");
            Console.CancelKeyPress += (s, e) => { 
                running = false; 
                e.Cancel = true; 
                Console.WriteLine("\n[INFO] Shutting down...");
            };

            while (running)
            {
                Thread.Sleep(100);
            }

            // Cleanup
            try { _host?.DisableConnection(); } catch { }
            try { _host?.Dispose(); } catch { }
            Console.WriteLine("[INFO] Stopped.");
        }

        static void OnGazeData(double x, double y, double timestamp)
        {
            if (!_isConnected || _stream == null) return;

            // Filter out Invalid/NaN data (Eyes lost)
            if (double.IsNaN(x) || double.IsNaN(y))
            {
                return;
            }

            // Tobii Interaction Library returns (x,y) in pixels (screen coordinates)
            // But verify if they are pixels or normalized. 
            // Usually CreateGazePointDataStream returns pixels.
            
            double screenW = GetSystemMetrics(0); // CXSCREEN
            double screenH = GetSystemMetrics(1); // CYSCREEN
            
            if (screenW <= 0 || screenH <= 0) return;

            // NEW: Filter out "Frozen" gaze (repeated identical coordinates)
            // Tobii driver sometimes emits last valid point continuously when eyes are lost
            // FIX: Allow up to 60 frames (approx 0.5s-1s) of identical data before dropping
            // Use epsilon to catch micro-variations if driver adds noise to frozen data
            if (Math.Abs(x - _lastX) < EPSILON && Math.Abs(y - _lastY) < EPSILON)
            {
                _frozenFrameCount++;
                if (_frozenFrameCount > 60) return;
            }
            else
            {
                _frozenFrameCount = 0;
            }
            _lastX = x;
            _lastY = y;

            double normX = x / screenW;
            double normY = y / screenH;
            
            // Clamp
            normX = Math.Max(0, Math.Min(1, normX));
            normY = Math.Max(0, Math.Min(1, normY));

            // Precise wall-clock timestamp and frame counter
            long wallClockMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            _frameCounter++;

            // Track frame timing gaps for quality monitoring
            if (_lastFrameTimeMs > 0)
            {
                long gapMs = wallClockMs - _lastFrameTimeMs;
                if (gapMs > _maxGapMs) _maxGapMs = gapMs;
                // Warn on gaps > 50ms (missed frames at 133Hz ~= 7.5ms/frame)
                if (gapMs > 50)
                {
                    _gapWarningCount++;
                    if (_gapWarningCount <= 10 || _gapWarningCount % 100 == 0)
                    {
                        Console.WriteLine($"[QUALITY] Frame gap: {gapMs}ms (frame #{_frameCounter})");
                    }
                }
            }
            _lastFrameTimeMs = wallClockMs;

            SendJson(new
            {
                type = "gaze",
                timestamp = wallClockMs,
                tobii_timestamp = (long)timestamp,
                x = normX,
                y = normY,
                is_valid = true,
                confidence = 1.0,
                screen_x = x,
                screen_y = y,
                frame = _frameCounter
            });
            _gazeDataCount++;
            if (_gazeDataCount % 60 == 0) // Log 1/sec approx
            {
               Console.WriteLine($"[GAZE DEBUG] Raw: ({x:F1}, {y:F1}) Screen: {screenW}x{screenH} Norm: ({normX:F3}, {normY:F3}) Frame: {_frameCounter} MaxGap: {_maxGapMs}ms");
            }
        }

        static double _lastX = -1;
        static double _lastY = -1;
        static int _frozenFrameCount = 0;
        const double EPSILON = 0.00001; // Tolerance for float equality (approx 0.02 pixels)

        static void SendJson(object data)
        {
            if (_stream == null || !_isConnected) return;
            try
            {
                string json = JsonSerializer.Serialize(data);
                byte[] bytes = Encoding.UTF8.GetBytes(json + "\n");
                _stream.Write(bytes, 0, bytes.Length);
            }
            catch
            {
                _isConnected = false;
            }
        }

        static void RunTcpServer(ref bool running)
        {
            TcpListener? listener = null;
            try
            {
                listener = new TcpListener(IPAddress.Loopback, Port);
                listener.Start();
                Console.WriteLine($"[TCP] Listening on {Port}...");

                while (running)
                {
                    if (listener.Pending())
                    {
                        var client = listener.AcceptTcpClient();
                        client.NoDelay = true;
                        _tcpClient = client;
                        _stream = client.GetStream();
                        _isConnected = true;
                        Console.WriteLine("[TCP] Connected!");
                    }
                    else
                    {
                        Thread.Sleep(100);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TCP ERROR] {ex.Message}");
            }
            finally
            {
                listener?.Stop();
            }
        }

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        static extern int GetSystemMetrics(int nIndex);

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        static extern bool SetProcessDPIAware();
    }
}
