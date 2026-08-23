import { Directory, File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { RECEIPT_PHOTO_QUALITY } from "../config/tunables";
import { generateId } from "./uuid";

// Receipt photos (spec Part C §3 §6, "applies wherever photos appear").
//
// Two rules drive everything in this file:
//   - The DB stores only a REFERENCE. The image itself lives in the app's
//     private storage; never put bytes in SQLite (they cripple sync).
//   - It must NEVER block a save (G8). So nothing here throws: every failure
//     path — no permission, cancelled, camera missing, copy failed — returns
//     null and the sale saves without a photo.
//
// The Supabase Storage backup half of that spec belongs to the sync routine,
// not to this section; the sale row already carries a receipt_photo_cloud_url
// column for it to fill in later.

const RECEIPTS_DIR = "receipts";

export interface ReceiptPhoto {
  localPath: string;
}

// Copies the picked image out of the OS cache into app storage, so it survives
// the system reclaiming cache space. The moment this returns, the local file
// is the only copy that exists — which is exactly why Settings' future
// "free up space" action may only delete photos confirmed backed up.
function persistLocally(sourceUri: string): string {
  const dir = new Directory(Paths.document, RECEIPTS_DIR);
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

// Opens the camera (it is a receipt, at a counter). If the camera is
// unavailable or its permission is refused, quietly falls back to the photo
// library rather than dead-ending.
export async function captureReceiptPhoto(): Promise<ReceiptPhoto | null> {
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

    return { localPath: persistLocally(asset.uri) };
  } catch (err) {
    // Logged, not surfaced as an error state: an unavailable camera is not a
    // reason to interrupt a sale.
    console.warn("[receiptPhoto] could not attach a photo", err);
    return null;
  }
}
