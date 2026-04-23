using System;
using System.Runtime.InteropServices;

namespace TobiiGazeHelper
{
    public static class TobiiInterop
    {
        private const string DllName = "tobii_stream_engine.dll";

        // ==========================================
        // ENUMS
        // ==========================================
        public enum tobii_error_t
        {
            TOBII_ERROR_NO_ERROR = 0,
            TOBII_ERROR_INTERNAL = 1,
            TOBII_ERROR_INSUFFICIENT_LICENSE = 2,
            TOBII_ERROR_NOT_SUPPORTED = 3,
            TOBII_ERROR_NOT_AVAILABLE = 4,
            TOBII_ERROR_CONNECTION_FAILED = 5,
            TOBII_ERROR_TIMED_OUT = 6,
            TOBII_ERROR_ALLOCATION_FAILED = 7,
            TOBII_ERROR_INVALID_PARAMETER = 8,
            TOBII_ERROR_CALIBRATION_ALREADY_STARTED = 9,
            TOBII_ERROR_CALIBRATION_NOT_STARTED = 10,
            TOBII_ERROR_ALREADY_SUBSCRIBED = 11,
            TOBII_ERROR_NOT_SUBSCRIBED = 12,
            TOBII_ERROR_OPERATION_FAILED = 13,
            TOBII_ERROR_CONFLICTING_API_INSTANCES = 14,
            TOBII_ERROR_CALIBRATION_BUSY = 15,
            TOBII_ERROR_CALLBACK_IN_PROGRESS = 16,
            TOBII_ERROR_TOO_MANY_SUBSCRIBERS = 17
        }

        public enum tobii_validity_t
        {
            TOBII_VALIDITY_INVALID = 0,
            TOBII_VALIDITY_VALID = 1
        }

        // ==========================================
        // STRUCTS
        // ==========================================
        public enum tobii_field_of_use_t
        {
            TOBII_FIELD_OF_USE_INTERACTIVE = 1,
            TOBII_FIELD_OF_USE_ANALYTICAL = 2
        }

        // ==========================================
        // STRUCTS
        // ==========================================
        [StructLayout(LayoutKind.Sequential)]
        public struct tobii_version_t
        {
            public int major;
            public int minor;
            public int revision;
            public int build;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct tobii_gaze_point_t
        {
            public float position_xy_x;
            public float position_xy_y;
            public tobii_validity_t validity;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct tobii_gaze_origin_t
        {
            public float position_xyz_x;
            public float position_xyz_y;
            public float position_xyz_z;
            public tobii_validity_t validity;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct tobii_gaze_data_t
        {
            public long timestamp_us;
            public tobii_gaze_point_t left_gaze_point;
            public tobii_gaze_origin_t left_gaze_origin; // Not used but needed for struct size
            public float left_pupil_diameter;
            public tobii_validity_t left_pupil_validity;
            
            public tobii_gaze_point_t right_gaze_point;
            public tobii_gaze_origin_t right_gaze_origin;
            public float right_pupil_diameter;
            public tobii_validity_t right_pupil_validity;
        }

        // ==========================================
        // DELEGATES
        // ==========================================
        // typedef void (*tobii_gaze_data_callback_t)( tobii_gaze_data_t const* gaze_data, void* user_data );
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        public delegate void tobii_gaze_data_callback_t(ref tobii_gaze_data_t gaze_data, IntPtr user_data);

        // typedef void (*tobii_url_receiver_t)( char const* url, void* user_data );
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        public delegate void tobii_url_receiver_t(string url, IntPtr user_data);

        // ==========================================
        // FUNCTIONS
        // ==========================================

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
        public static extern tobii_error_t tobii_api_create(out IntPtr api, IntPtr custom_alloc, IntPtr custom_log);

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
        public static extern tobii_error_t tobii_api_destroy(IntPtr api);

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
        public static extern tobii_error_t tobii_enumerate_local_device_urls(IntPtr api, tobii_url_receiver_t receiver, IntPtr user_data);

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
        public static extern tobii_error_t tobii_device_create(IntPtr api, string url, tobii_field_of_use_t field_of_use, out IntPtr device);

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
        public static extern tobii_error_t tobii_device_destroy(IntPtr device);

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
        public static extern tobii_error_t tobii_gaze_data_subscribe(IntPtr device, tobii_gaze_data_callback_t callback, IntPtr user_data);

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
        public static extern tobii_error_t tobii_gaze_data_unsubscribe(IntPtr device);

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
        public static extern tobii_error_t tobii_device_process_callbacks(IntPtr device);

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
        public static extern tobii_error_t tobii_device_reconnect(IntPtr device);
        
        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
        public static extern tobii_error_t tobii_get_api_version(out tobii_version_t version);
    }
}
