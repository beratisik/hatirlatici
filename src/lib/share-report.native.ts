import { Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function shareReportCard(message: string, title = 'Mezuniyet Karnesi'): Promise<void> {
  if (await Sharing.isAvailableAsync()) {
    const file = new File(Paths.cache, 'mezuniyet-karnesi.txt');
    file.create({ overwrite: true });
    file.write(message);
    await Sharing.shareAsync(file.uri, {
      dialogTitle: title,
      mimeType: 'text/plain',
    });
    return;
  }

  await Share.share({ message, title });
}
