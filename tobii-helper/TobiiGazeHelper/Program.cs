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
    //
    // Silence has several causes that need different responses, so the helper
    // reports what the Tobii engine itself says (connection, device status,
    // user presence, gaze tracking) in a low-rate "status" message:
    //   - nobody in front of the tracker / looking away: normal, never "repaired";
    //   - tracker unplugged, tracking paused, engine not running: reported so the
    //     UI can say why there is no gaze instead of failing silently;
    //   - the engine claims gaze IS tracked yet no sample arrives: a stalled
    //     stream. Only this contradiction re-creates the Host, with bounded
    //     backoff, then exits non-zero so the app's supervisor restarts us.
    internal static class Program
    {
        private const int Port = 5555;
        private const long SilenceTimeoutMs = 150;
        private const long StatusHeartbeatMs = 1000;
        private const long StatusMinIntervalMs = 100;
        private const long StallTimeoutMs = 3000;
        private const long MaxRecoveryBackoffMs = 30000;
        private const int MaxInProcessRecoveries = 4;
        private const int StalledExitCode = 3;
        private const int CloseHostTimeoutMs = 2000;
        private const string Unknown = "Unknown";

        private static readonly Stopwatch Clock = Stopwatch.StartNew();
        private static volatile bool _running = true;
        private static bool _verbose;
        private static bool _watchdogEnabled = true;
        private static GazePointDataMode _streamMode = GazePointDataMode.Unfiltered;
        private static bool _testStallFirstHost;
        private static object? _latestSample;
        private static long _lastCallbackMs;
        private static long _frame;
        private static long _trackingEpoch;
        private static double _lastDeviceTimestamp = double.NegativeInfinity;
        private static readonly AutoResetEvent SampleReady = new AutoResetEvent(false);

        // Host lifetime. Callbacks capture their generation; anything from a
        // replaced Host is ignored.
        private static readonly object HostLock = new object();
        private static Host? _host;
        private static GazePointDataStream? _gazeStream;
        private static EngineStateObserver<EyeTrackingDeviceStatus>? _deviceObserver;
        private static EngineStateObserver<UserPresence>? _presenceObserver;
        private static EngineStateObserver<GazeTracking>? _gazeTrackingObserver;
        private static EngineStateObserver<Rectangle>? _screenBoundsObserver;
        private static long _hostGeneration;

        // Engine-reported state, written from SDK threads (see SetState/State).
        private static string _connection = Unknown;
        private static string _deviceStatus = Unknown;
        private static string _userPresence = Unknown;
        private static string _gazeTracking = Unknown;
        private static long _gazeTrackedSinceMs = -1;
        private static int _statusDirty = 1;

        // Watchdog state, main thread only (read by the status builder).
        private static long _stallStartedMs = -1;
        private static long _nextRecoveryAtMs;
        private static int _consecutiveRecoveries;
        private static long _totalRecoveries;
        private static volatile bool _recovering;

        private static int Main(string[] args)
        {
            _verbose = Array.Exists(args, a => a == "--verbose" || a == "-v") ||
                       Environment.GetEnvironmentVariable("GAZE_DEBUG") == "1";
            // Rollback/diagnostics: report state but never re-create the Host.
            _watchdogEnabled = Environment.GetEnvironmentVariable("GAZE_HELPER_WATCHDOG") != "0";
            // The vendor's LightlyFiltered smoothing costs latency. On live recordings
            // (21 Sep 2026) a real eye movement took a median 91 ms (p90 241 ms) to
            // cross in that stream and 62 ms (p90 182 ms) unsmoothed, and the
            // maintainer judged the unsmoothed stream the faster one on the tracker.
            // The backend's estimator is noise-aware and confirms a jump for one
            // sample on this stream, so unsmoothed is the default.
            // GAZE_HELPER_STREAM=lightly_filtered is the way back.
            string requestedStream = (Environment.GetEnvironmentVariable("GAZE_HELPER_STREAM") ?? "")
                .Trim().Replace("_", "").Replace("-", "");
            if (string.Equals(requestedStream, "lightlyfiltered", StringComparison.OrdinalIgnoreCase))
                _streamMode = GazePointDataMode.LightlyFiltered;
            else if (requestedStream.Length > 0 &&
                     !string.Equals(requestedStream, "unfiltered", StringComparison.OrdinalIgnoreCase))
                Console.WriteLine("[TOBII] GAZE_HELPER_STREAM not recognised (use unfiltered or lightly_filtered); using Unfiltered");
            // Hardware test hook: the first Host's samples are discarded so the
            // stalled-stream recovery can be exercised against a live tracker.
            _testStallFirstHost = Array.Exists(args, a => a == "--test-stall-first-host");
            Console.CancelKeyPress += (_, e) => { e.Cancel = true; _running = false; };
            // Electron passes --exit-with-parent. Without it a killed or crashed app
            // leaves this helper holding port 5555 for ever, and the next launch has
            // to hunt it down before it can start.
            if (Array.Exists(args, a => a == "--exit-with-parent")) WatchParentPipe();
            EnableDpiAwareness();
            Thread? worker = null;
            try
            {
                OpenHost("startup");
                worker = new Thread(RunTcpServer) { IsBackground = true, Name = "Gaze transport" };
                worker.Start();
                Console.WriteLine("[TOBII] Interaction stream initialized. Waiting for valid samples.");
                while (_running)
                {
                    Thread.Sleep(100);
                    EvaluateWatchdog();
                }
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
                CloseHost();
            }
        }

        // The parent starts this helper with its stdio piped, so the read end
        // breaking is the only notice it gets that the app has gone. Ctrl+C and the
        // stalled-stream watchdog still stop it in their own ways.
        private static void WatchParentPipe()
        {
            var watcher = new Thread(() =>
            {
                try
                {
                    using Stream input = Console.OpenStandardInput();
                    var buffer = new byte[256];
                    while (input.Read(buffer, 0, buffer.Length) > 0) { }
                }
                catch
                {
                    // A broken pipe says the same thing as end of file.
                }
                Console.WriteLine("[TOBII] Parent process ended; stopping.");
                _running = false;
            })
            { IsBackground = true, Name = "Parent pipe watch" };
            watcher.Start();
        }

        private static void OpenHost(string reason)
        {
            lock (HostLock)
            {
                long generation = Interlocked.Increment(ref _hostGeneration);
                SetState(ref _connection, Unknown);
                SetState(ref _deviceStatus, Unknown);
                SetState(ref _userPresence, Unknown);
                SetState(ref _gazeTracking, Unknown);
                Interlocked.Exchange(ref _gazeTrackedSinceMs, -1);
                Interlocked.Exchange(ref _lastDeviceTimestamp, double.NegativeInfinity);

                var host = new Host();
                _host = host;
                host.Context.ConnectionStateChanged += (_, e) =>
                {
                    if (generation == Interlocked.Read(ref _hostGeneration)) SetState(ref _connection, e.State.ToString());
                };
                SetState(ref _connection, host.Context.ConnectionState.ToString());

                _deviceObserver = host.States.CreateEyeTrackingDeviceStatusObserver();
                _deviceObserver.WhenChanged(v =>
                {
                    if (generation == Interlocked.Read(ref _hostGeneration))
                        SetState(ref _deviceStatus, v.IsValid ? v.Value.ToString() : Unknown);
                });
                _presenceObserver = host.States.CreateUserPresenceObserver();
                _presenceObserver.WhenChanged(v =>
                {
                    if (generation == Interlocked.Read(ref _hostGeneration))
                        SetState(ref _userPresence, v.IsValid ? v.Value.ToString() : Unknown);
                });
                _gazeTrackingObserver = host.States.CreateGazeTrackingObserver();
                _gazeTrackingObserver.WhenChanged(v =>
                {
                    if (generation != Interlocked.Read(ref _hostGeneration)) return;
                    string value = v.IsValid ? v.Value.ToString() : Unknown;
                    bool tracked = value == nameof(GazeTracking.GazeTracked);
                    if (!tracked) Interlocked.Exchange(ref _gazeTrackedSinceMs, -1);
                    else Interlocked.CompareExchange(ref _gazeTrackedSinceMs, Clock.ElapsedMilliseconds, -1);
                    SetState(ref _gazeTracking, value);
                });
                _screenBoundsObserver = host.States.CreateScreenBoundsObserver();

                bool discard = _testStallFirstHost && generation == 1;
                _gazeStream = host.Streams.CreateGazePointDataStream(_streamMode);
                _gazeStream.GazePoint((x, y, deviceTimestamp) =>
                {
                    if (discard || generation != Interlocked.Read(ref _hostGeneration)) return;
                    OnGazeData(x, y, deviceTimestamp);
                });
                Console.WriteLine($"[TOBII] Host #{generation} created ({reason}); stream={_streamMode}; connection={State(ref _connection)}");
            }
        }

        private static void CloseHost()
        {
            Host? host;
            GazePointDataStream? stream;
            EngineStateObserver<EyeTrackingDeviceStatus>? device;
            EngineStateObserver<UserPresence>? presence;
            EngineStateObserver<GazeTracking>? tracking;
            EngineStateObserver<Rectangle>? bounds;
            lock (HostLock)
            {
                Interlocked.Increment(ref _hostGeneration); // Orphan in-flight callbacks first.
                host = _host; stream = _gazeStream; device = _deviceObserver;
                presence = _presenceObserver; tracking = _gazeTrackingObserver; bounds = _screenBoundsObserver;
                _host = null; _gazeStream = null; _deviceObserver = null;
                _presenceObserver = null; _gazeTrackingObserver = null; _screenBoundsObserver = null;
            }
            if (host == null) return;
            // Dispose outside the lock and off this thread: a wedged engine
            // must not be able to hang shutdown or block the replacement Host.
            var closer = new Thread(() =>
            {
                try { if (stream != null) stream.IsEnabled = false; } catch { }
                try { device?.Dispose(); } catch { }
                try { presence?.Dispose(); } catch { }
                try { tracking?.Dispose(); } catch { }
                try { bounds?.Dispose(); } catch { }
                try { host.DisableConnection(); } catch { }
                try { host.Dispose(); } catch { }
            }) { IsBackground = true, Name = "Host close" };
            closer.Start();
            if (!closer.Join(CloseHostTimeoutMs))
                Console.Error.WriteLine("[TOBII] Closing the previous Host timed out; continuing without it.");
        }

        private static string State(ref string field) => Volatile.Read(ref field);

        private static void SetState(ref string field, string value)
        {
            if (Interlocked.Exchange(ref field, value) == value) return;
            Interlocked.Exchange(ref _statusDirty, 1);
            if (_verbose)
                Console.WriteLine($"[TOBII] state: connection={State(ref _connection)} device={State(ref _deviceStatus)} " +
                                  $"presence={State(ref _userPresence)} gaze={State(ref _gazeTracking)}");
        }

        private static bool SamplesAreFlowing(long now) =>
            Interlocked.Read(ref _frame) > 0 && now - Interlocked.Read(ref _lastCallbackMs) <= SilenceTimeoutMs;

        // The only fault treated as repairable: the engine says it is tracking
        // gaze, continuously, while no sample reaches us.
        private static bool StreamIsStalled(long now)
        {
            long trackedSince = Interlocked.Read(ref _gazeTrackedSinceMs);
            return trackedSince >= 0 && now - trackedSince >= StallTimeoutMs &&
                   now - Interlocked.Read(ref _lastCallbackMs) >= StallTimeoutMs;
        }

        private static void EvaluateWatchdog()
        {
            long now = Clock.ElapsedMilliseconds;
            bool flowing = SamplesAreFlowing(now);
            if (flowing && _consecutiveRecoveries != 0)
            {
                Console.WriteLine("[TOBII] Gaze samples resumed.");
                _consecutiveRecoveries = 0;
                _nextRecoveryAtMs = 0;
                Interlocked.Exchange(ref _statusDirty, 1);
            }
            if (flowing || !StreamIsStalled(now))
            {
                if (_stallStartedMs >= 0)
                {
                    _stallStartedMs = -1;
                    Interlocked.Exchange(ref _statusDirty, 1);
                }
                return;
            }
            if (_stallStartedMs < 0)
            {
                _stallStartedMs = now;
                Interlocked.Exchange(ref _statusDirty, 1);
                Console.Error.WriteLine("[TOBII] Stalled stream: the engine reports gaze tracked but no sample has arrived for " +
                                        $"{now - Interlocked.Read(ref _lastCallbackMs)} ms.");
            }
            if (!_watchdogEnabled || now < _nextRecoveryAtMs) return;
            if (_consecutiveRecoveries >= MaxInProcessRecoveries)
            {
                Console.Error.WriteLine($"[TOBII] Still stalled after {_consecutiveRecoveries} Host re-creations; exiting so the app can restart the helper.");
                Environment.ExitCode = StalledExitCode;
                _running = false;
                return;
            }
            _consecutiveRecoveries++;
            _totalRecoveries++;
            _nextRecoveryAtMs = now + Math.Min(MaxRecoveryBackoffMs, StallTimeoutMs << _consecutiveRecoveries);
            _recovering = true;
            Interlocked.Exchange(ref _statusDirty, 1);
            try
            {
                CloseHost();
                OpenHost($"stalled-stream recovery {_consecutiveRecoveries}/{MaxInProcessRecoveries}");
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[TOBII] Host re-creation failed: {ex.Message}");
            }
            finally
            {
                _recovering = false;
                Interlocked.Exchange(ref _statusDirty, 1);
            }
        }

        private static string DeriveStreamState(long now)
        {
            if (_recovering) return "recovering";
            if (SamplesAreFlowing(now)) return "streaming";
            string connection = State(ref _connection);
            if (connection != nameof(Tobii.Interaction.Client.ConnectionState.Connected))
                return connection == Unknown ? "starting" : "engine_unavailable";
            switch (State(ref _deviceStatus))
            {
                case nameof(EyeTrackingDeviceStatus.Tracking): break;
                case Unknown: return "starting";
                case nameof(EyeTrackingDeviceStatus.DeviceNotConnected): return "device_not_connected";
                case nameof(EyeTrackingDeviceStatus.TrackingPaused): return "tracking_paused";
                default: return "device_unavailable";
            }
            if (StreamIsStalled(now)) return "stalled";
            return State(ref _userPresence) == nameof(UserPresence.NotPresent) ? "no_user" : "no_gaze";
        }

        private static object BuildStatus()
        {
            long now = Clock.ElapsedMilliseconds;
            double[]? engineScreen = null;
            try
            {
                var bounds = _screenBoundsObserver?.CurrentValue;
                if (bounds != null && bounds.IsValid)
                    engineScreen = new[] { bounds.Value.X, bounds.Value.Y, bounds.Value.Width, bounds.Value.Height };
            }
            catch { }
            return new
            {
                type = "status",
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                helper_monotonic_ms = now,
                stream_state = DeriveStreamState(now),
                connection = State(ref _connection),
                device_status = State(ref _deviceStatus),
                user_presence = State(ref _userPresence),
                gaze_tracking = State(ref _gazeTracking),
                ms_since_sample = Interlocked.Read(ref _frame) > 0 ? now - Interlocked.Read(ref _lastCallbackMs) : -1,
                recoveries = _totalRecoveries,
                watchdog = _watchdogEnabled,
                stream_mode = _streamMode.ToString(),
                // Gaze is normalized by the primary screen; the engine's own
                // tracked-screen bounds let the consumer verify they agree.
                screen_width_px = GetSystemMetrics(0),
                screen_height_px = GetSystemMetrics(1),
                engine_screen_bounds = engineScreen
            };
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
            long lastStatusSentMs = long.MinValue / 2;

            void DropClient()
            {
                stream?.Dispose();
                client?.Dispose();
                stream = null;
                client = null;
            }

            bool TrySend(object message)
            {
                if (stream == null) return false;
                try
                {
                    byte[] bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(message) + "\n");
                    stream.Write(bytes, 0, bytes.Length);
                    return true;
                }
                catch (Exception ex) when (ex is System.IO.IOException || ex is SocketException || ex is ObjectDisposedException)
                {
                    DropClient();
                    return false;
                }
            }

            try
            {
                listener.Start();
                Console.WriteLine($"[TCP] Listening on 127.0.0.1:{Port}");
                while (_running)
                {
                    if (listener.Pending())
                    {
                        DropClient();
                        client = listener.AcceptTcpClient();
                        client.NoDelay = true;
                        client.SendBufferSize = 4096;
                        client.SendTimeout = 100;
                        stream = client.GetStream();
                        stream.WriteTimeout = 100;
                        silenceReported = false;
                        lastStatusSentMs = long.MinValue / 2; // A new consumer learns the state at once.
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
                            Interlocked.Exchange(ref _statusDirty, 1); // Say why, promptly.
                        }
                    }
                    else if (sample != null)
                    {
                        if (silenceReported) Interlocked.Exchange(ref _statusDirty, 1);
                        silenceReported = false;
                    }
                    if (sample != null && TrySend(sample) &&
                        _verbose && Interlocked.Read(ref _frame) % 120 == 0)
                        Console.WriteLine($"[GAZE] frame={Interlocked.Read(ref _frame)} callbackAgeMs={sinceCallback}");

                    // Low-rate state report: on change, and as a heartbeat so a
                    // silent tracker is never indistinguishable from a dead helper.
                    long nowMs = Clock.ElapsedMilliseconds;
                    long sinceStatus = nowMs - lastStatusSentMs;
                    if (stream != null && (sinceStatus >= StatusHeartbeatMs ||
                        (sinceStatus >= StatusMinIntervalMs && Volatile.Read(ref _statusDirty) == 1)))
                    {
                        Interlocked.Exchange(ref _statusDirty, 0); // Cleared first: a later change re-arms it.
                        if (TrySend(BuildStatus())) lastStatusSentMs = nowMs;
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
                DropClient();
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
