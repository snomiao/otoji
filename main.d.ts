// Re-export the napi-rs generated types and add the wrapper-only helpers.
export {
  PolishOptions,
  TranscribeOptions,
  polishText,
  transcribePcm,
} from "./index";

/** True if the platform-specific native binding loaded successfully. */
export declare function isNativeAvailable(): boolean;

/** The error captured the last time we tried to load the native binding,
 *  or `null` if it loaded successfully. */
export declare function nativeLoadError(): Error | null;
