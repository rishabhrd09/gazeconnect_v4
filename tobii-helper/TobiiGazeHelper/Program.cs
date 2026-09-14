using System;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using Tobii.Interaction;
using Tobii.Interaction.Framework;

namespace TobiiGazeHelper
{
    // The SDK callback only publishes to a single replaceable mailbox. All
    // networking/serialization occurs on our worker, never on Tobii's callback.
    internal static class Program
    {
        private const int Port = 5555;
        private const long SilenceTimeoutMs = 150;
        private static readonly Stopwatch Clock = Stopwatch.StartNew();
        private static volatile bool _running = true;
        private static bool _verbose;
        private static object? _latestSample;
        private static long _lastCallbackMs;
        private static long _frame;
        private static long _trackingEpoch;
        private static double _lastDeviceTimestamp = double.NegativeInfinity;
        private static Host? _host;
        private static GazePointDataStream? _gazeStream;
        private static readonly AutoResetEvent SampleReady = new AutoResetEvent(false);

        private static int Main(string[] args)
        {
            _verbose = Array.Exists(args, a => a == "--verbose" || a == "-v") ||
                       Environment.GetEnvironmentVariable("GAZE_DEBUG") == "1";
            Console.CancelKeyPress += (_, e) => { e.Cancel = true; _running = false; };
            EnableDpiAwareness();
            Thread? worker = null;
            try
            {
                _host = new Host();
                _gazeStream = _host.Streams.CreateGazePointDataStream(GazePointDataMode.LightlyFiltered);
                _gazeStream.GazePoint(OnGazeData);
                worker = new Thread(RunTcpServer) { IsBackground = true, Name = "Gaze transport" };
                worker.Start();
                Console.WriteLine("[TOBII] Interaction stream initialized. Waiting for valid samples.");
                while (_running) Thread.Sleep(50);
                return Environment.ExitCode;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[TOBII] Could not initialize: {ex.Message}");
                Console.Error.WriteLine("Ensure Tobii Experience and its eye tracking service are installed and running.");
                return 1;
            }
            finally
            {
                _running = false;
                worker?.Join(500);
                try { _host?.DisableConnection(); } catch { }
                try { _host?.Dispose(); } catch { }
            }
        }

        private static void OnGazeData(double x, double y, double deviceTimestamp)
        {
            long now = Clock.ElapsedMilliseconds;
            long previousCallback = Interlocked.Exchange(ref _lastCallbackMs, now);
            long frame = Interlocked.Increment(ref _frame);
            int width = GetSystemMetrics(0);
            int height = GetSystemMetrics(1);
            // Interaction uses primary-screen pixel coordinates. Do not stretch
            // edges or clamp off-screen gaze onto an actionable border.
            bool valid = double.IsFinite(x) && double.IsFinite(y) &&
                         double.IsFinite(deviceTimestamp) && width > 0 && height > 0;
            // Identical positions are allowed: a steady fixation is not a lost
            // sample. Repeated/regressed source time is not a new measurement.
            if (valid)
            {
                double previous = _lastDeviceTimestamp;
                valid = deviceTimestamp > previous || now - previousCallback > SilenceTimeoutMs;
                if (valid) Interlocked.Exchange(ref _lastDeviceTimestamp, deviceTimestamp);
            }
            if (!valid) Interlocked.Increment(ref _trackingEpoch);
            object sample = new
            {
                type = "gaze",
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                tobii_timestamp = double.IsFinite(deviceTimestamp) ? deviceTimestamp : 0,
                helper_monotonic_ms = now,
                tracking_epoch = Interlocked.Read(ref _trackingEpoch),
                x = valid ? x / width : 0.5,
                y = valid ? y / height : 0.5,
                is_valid = valid,
                // The combined stream has no per-eye confidence measurement.
                confidence = valid ? 0.75 : 0.0,
                validity_source = "combined",
                coord_space = "primary_screen_normalized",
                screen_width_px = width,
                screen_height_px = height,
                frame
            };
            Interlocked.Exchange(ref _latestSample, sample);
            SampleReady.Set();
        }

        private static void RunTcpServer()
        {
            TcpClient? client = null;
            NetworkStream? stream = null;
            var listener = new TcpListener(IPAddress.Loopback, Port);
            bool silenceReported = false;
            try
            {
                listener.Start();
                Console.WriteLine($"[TCP] Listening on 127.0.0.1:{Port}");
                while (_running)
                {
                    if (listener.Pending())
                    {
                        stream?.Dispose();
                        client?.Dispose();
                        client = listener.AcceptTcpClient();
                        client.NoDelay = true;
                        client.SendBufferSize = 4096;
                        client.SendTimeout = 100;
                        stream = client.GetStream();
                        stream.WriteTimeout = 100;
                        silenceReported = false;
                        Console.WriteLine("[TCP] Backend connected");
                    }
                    var sample = Interlocked.Exchange(ref _latestSample, null);
                    long sinceCallback = Clock.ElapsedMilliseconds - Interlocked.Read(ref _lastCallbackMs);
                    if (sinceCallback > SilenceTimeoutMs)
                    {
                        sample = null; // Never emit an old queued measurement after a stall.
                        if (!silenceReported)
                        {
                            Interlocked.Increment(ref _trackingEpoch);
                            sample = new { type = "gaze", timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                                           x = 0.5, y = 0.5, is_valid = false, confidence = 0.0,
                                           validity_source = "timeout" };
                            silenceReported = true;
                        }
                    }
                    else if (sample != null)
                    {
                        silenceReported = false;
                    }
                    if (stream != null && sample != null)
                    {
                        try
                        {
                            byte[] bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(sample) + "\n");
                            stream.Write(bytes, 0, bytes.Length);
                            if (_verbose && Interlocked.Read(ref _frame) % 120 == 0)
                                Console.WriteLine($"[GAZE] frame={Interlocked.Read(ref _frame)} callbackAgeMs={sinceCallback}");
                        }
                        catch (Exception ex) when (ex is System.IO.IOException || ex is SocketException || ex is ObjectDisposedException)
                        {
                            stream.Dispose();
                            client?.Dispose();
                            stream = null;
                            client = null;
                        }
                    }
                    SampleReady.WaitOne(20); // Wake on data; timeout services accept/silence checks.
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[TCP] Transport failed: {ex.Message}");
                Environment.ExitCode = 1;
                _running = false;
            }
            finally
            {
                stream?.Dispose();
                client?.Dispose();
                listener.Stop();
            }
        }

        private static void EnableDpiAwareness()
        {
            try
            {
                // PER_MONITOR_AWARE_V2; available on supported modern Windows 10/11.
                if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return;
            }
            catch (EntryPointNotFoundException) { }
            SetProcessDPIAware();
        }

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int index);
        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();
        [DllImport("user32.dll")]
        private static extern bool SetProcessDpiAwarenessContext(IntPtr awareness);
    }
}
