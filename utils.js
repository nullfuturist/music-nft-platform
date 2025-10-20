const { PublicKey } = require('@solana/web3.js');
const { spawn } = require('child_process');

// Validate Solana public key
function isValidSolanaAddress(address) {
    try {
        new PublicKey(address);
        return true;
    } catch {
        return false;
    }
}

// Validate mint price
function validateMintPrice(price) {
    const numPrice = parseFloat(price);
    if (isNaN(numPrice)) throw new Error('Invalid mint price format');
    if (numPrice < 0) throw new Error('Mint price cannot be negative');
    if (numPrice > 1000) throw new Error('Mint price cannot exceed 1000 SOL');
    return numPrice;
}

// MP4 generation function
function generateMP4(audioPath, imagePath, outputPath) {
    return new Promise((resolve, reject) => {
        // Validate input files exist
        if (!require('fs').existsSync(audioPath)) {
            reject(new Error(`Audio file not found: ${audioPath}`));
            return;
        }
        if (!require('fs').existsSync(imagePath)) {
            reject(new Error(`Image file not found: ${imagePath}`));
            return;
        }

        const args = [
            '-loop', '1',                    // Loop the image
            '-i', imagePath,                 // Input image
            '-i', audioPath,                 // Input audio
            '-c:v', 'libx264',              // Video codec
            '-tune', 'stillimage',          // Optimize for still image
            '-c:a', 'aac',                  // Audio codec
            '-b:a', '192k',                 // Audio bitrate
            '-pix_fmt', 'yuv420p',          // Pixel format for compatibility
            '-shortest',                     // End when shortest input ends
            '-y',                           // Overwrite output file
            outputPath
        ];

        const ffmpeg = spawn('ffmpeg', args);

        let stderr = '';
        
        ffmpeg.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                resolve(outputPath);
            } else {
                reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
            }
        });

        ffmpeg.on('error', (err) => {
            reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
        });
    });
}

module.exports = {
    isValidSolanaAddress,
    validateMintPrice,
    generateMP4
};
