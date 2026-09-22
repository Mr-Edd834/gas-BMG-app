import { Directory, File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { RECEIPT_PHOTO_QUALITY } from "../config/tunables";
import { generateId } from "./uuid";

// Every photo in the app (spec Part C §3 §6, "applies wherever photos appear"):
// sale receipts, and the cylinder and receipt photos a refill batch carries.
//
// Two rules drive everything here:
//   - The DB stores only a REFERENCE. The image lives in the app's private
//     storage; never put bytes in SQLite (they cripple sync).
//   - Nothing throws. Every failure path — no permission, cancelled, camera
//     missing, copy failed — returns null, so a photo can never block a save
//     (G8). Refilling is the one place a photo is *required*, and that is
//     enforced by its own save button, not by this function exploding.
//
// The Supabase Storage backup half of that spec belongs to the sync routine;
// the rows already carry a cloud_url column for it to fill in later.

export interface CapturedPhoto {
  localPath: string;
}

// Copies the picked image out of the OS cache into app storage, so it survives
// the system reclaiming cache space. The moment this returns, the local file
// is the only copy that exists — which is exactly why Settings' future
// "free up space" action may only delete photos confirmed backed up.
function persistLocally(sourceUri: string, subdir: string): string {
  const dir = new Directory(Paths.document, subdir);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }

  const extension = sourceUri.split(".").pop()?.toLowerCase();
  const safeExtension =
    extension && /^[a-z0-9]{2,4}$/.test(extension) ? extension : "jpg";

  const source = new File(sourceUri);
  const destination = new File(dir, `${generateId()}.${safeExtension}`);
  source.copy(destination);
  return destination.uri;
}

/**
 * Opens the camera, falling back to the photo library if the camera is
 * unavailable or refused — rather than dead-ending on a phone whose camera
 * permission was declined once, months ago.
 */
export async function capturePhoto(
  subdir: string
): Promise<CapturedPhoto | null> {
  try {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ["images"],
      quality: RECEIPT_PHOTO_QUALITY,
      allowsMultipleSelection: false,
    };

    let result: ImagePicker.ImagePickerResult | null = null;

    const camera = await ImagePicker.requestCameraPermissionsAsync();
    if (camera.granted) {
      result = await ImagePicker.launchCameraAsync(options);
    } else {
      const library = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!library.granted) return null;
      result = await ImagePicker.launchImageLibraryAsync(options);
    }

    if (!result || result.canceled) return null;
    const asset = result.assets?.[0];
    if (!asset?.uri) return null;

    return { localPath: persistLocally(asset.uri, subdir) };
  } catch (err) {
    // Logged, not surfaced: an unavailable camera is not a reason to
    // interrupt what she was doing.
    console.warn("[photos] could not capture a photo", err);
    return null;
  }
}

export const captureReceiptPhoto = () => capturePhoto("receipts");
export const captureRefillPhoto = () => capturePhoto("refills");

const PHOTO_DIRS = ["receipts", "refills"];

export interface PhotoStorage {
  count: number;
  bytes: number;
}

/**
 * How much of the phone the app's photos are using (spec Part C §6 §6).
 *
 * Measured, never estimated. The spec's mockup shows "212 MB" as placeholder
 * text and this is precisely the kind of number that must not be invented:
 * a figure she is asked to act on ("free up space") has to be the real one,
 * or the action she takes is based on fiction.
 *
 * Returns zeroes rather than throwing if the directories do not exist yet —
 * a shop that has taken no photos is a normal state, not an error.
 */
export async function photoStorage(): Promise<PhotoStorage> {
  let count = 0;
  let bytes = 0;

  for (const name of PHOTO_DIRS) {
    try {
      const dir = new Directory(Paths.document, name);
      if (!dir.exists) continue;
      for (const entry of dir.list()) {
        if (entry instanceof File) {
          count += 1;
          bytes += entry.size ?? 0;
        }
      }
    } catch (err) {
      // One unreadable folder must not hide the other's real total.
      console.warn(`[photos] could not measure ${name}`, err);
    }
  }

  return { count, bytes };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
