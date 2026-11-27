import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

const OPTIONS = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 };

// Opens the camera or photo library. Resolves to a list of image-picker assets (empty if cancelled).
// With limit > 1 the library allows picking several photos (cropping isn't available then).
// Throws an Error with a user-facing message if camera access is denied.
export async function pickImages(source, { limit = 1 } = {}) {
  const options =
    limit > 1
      ? { mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: limit, quality: 0.7 }
      : OPTIONS;
  let result;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Camera access is off. You can turn it on in Settings, or choose a photo instead.');
    }
    result = await ImagePicker.launchCameraAsync(OPTIONS);
  } else {
    // The photo library picker doesn't need a permission prompt.
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  return result.canceled ? [] : result.assets.slice(0, limit);
}

async function pick(source) {
  return (await pickImages(source))[0] ?? null;
}

// Shows "Take Photo / Choose from Library / Remove Photo / Cancel".
// onPicked(asset) uploads the chosen image; onRemove() deletes the current one.
// Errors from any step are passed to onError so the screen can show them.
export function showPhotoMenu({ title, hasPhoto, onPicked, onRemove, onError }) {
  const choose = (source) => async () => {
    try {
      const asset = await pick(source);
      if (asset) await onPicked(asset);
    } catch (e) {
      onError(e.message);
    }
  };
  const buttons = [
    { text: 'Take Photo', onPress: choose('camera') },
    { text: 'Choose from Library', onPress: choose('library') },
  ];
  if (hasPhoto) {
    buttons.push({
      text: 'Remove Photo',
      style: 'destructive',
      onPress: async () => {
        try {
          await onRemove();
        } catch (e) {
          onError(e.message);
        }
      },
    });
  }
  buttons.push({ text: 'Cancel', style: 'cancel' });
  Alert.alert(title, undefined, buttons);
}
