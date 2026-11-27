import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// Longest side in pixels. Claude looks at photos at up to ~2,600 px, so this keeps all the detail
// it uses while turning a 45 MB camera original into a ~1 MB upload.
const MAX_SIDE = 2048;

// Resizes a picked photo and re-saves it as JPEG before upload. This also converts HEIC photos
// (which Claude can't read) and drops the original's metadata, such as GPS location.
export async function prepareForUpload(asset) {
  const context = ImageManipulator.manipulate(asset.uri);
  try {
    let image = await context.renderAsync();
    // Read the size before releasing: a released image can't be read anymore.
    const { width, height } = image;
    if (Math.max(width, height) > MAX_SIDE) {
      image.release();
      context.resize(width >= height ? { width: MAX_SIDE } : { height: MAX_SIDE });
      image = await context.renderAsync();
    }
    try {
      const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
      return { ...asset, uri: result.uri, width: result.width, height: result.height, mimeType: 'image/jpeg' };
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}
