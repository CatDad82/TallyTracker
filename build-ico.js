import fs from 'fs';
import path from 'path';
import { Jimp } from 'jimp';
import pngToIco from 'png-to-ico';

async function main() {
  try {
    const srcJpg = 'src/assets/images/icon_desktop_1781951513066.jpg';
    if (!fs.existsSync(srcJpg)) {
      throw new Error(`Source image ${srcJpg} not found!`);
    }

    console.log('Loading source image...');
    const image = await Jimp.read(srcJpg);

    console.log('Resizing to 256x256 for ICO...');
    const img256 = image.clone().resize({ w: 256, h: 256 });
    
    // We can get buffer or write it temporarily
    const tempPngPath = 'assets/temp_256.png';
    await img256.write(tempPngPath);
    console.log('Wrote temporary 256x256 PNG.');

    console.log('Converting 256x256 PNG to ICO...');
    const icoBuffer = await pngToIco(tempPngPath);
    
    fs.writeFileSync('assets/icon_desktop.ico', icoBuffer);
    console.log('Successfully wrote assets/icon_desktop.ico!');

    // Cleanup temp png
    if (fs.existsSync(tempPngPath)) {
      fs.unlinkSync(tempPngPath);
    }

    // Now let's write clean standard 256x256 PNG to assets/icon.png and assets/icon_desktop.png
    console.log('Writing assets/icon.png (256x256) and assets/icon_desktop.png (512x512)...');
    
    // Write 256x255 PNG to icon.png
    const img512 = image.clone().resize({ w: 512, h: 512 });
    await img256.write('assets/icon.png');
    await img512.write('assets/icon_desktop.png');
    
    console.log('All icons compiled successfully!');
  } catch (error) {
    console.error('Error during icon compilation:', error);
    process.exit(1);
  }
}

main();
