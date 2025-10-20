const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function generateMP4(audioPath, imagePath, outputPath, duration = null) {
    return new Promise((resolve, reject) => {
        // Validate input files exist
        if (!fs.existsSync(audioPath)) {
            reject(new Error(`Audio file not found: ${audioPath}`));
            return;
        }
        if (!fs.existsSync(imagePath)) {
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

        // Add duration if specified
        if (duration) {
            args.splice(-2, 0, '-t', duration.toString());
        }

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

// Usage example
async function main() {
    try {
        const outputPath = await generateMP4(
            './uploads/1759096431894-procedural_music_var_03_chaos_dorian.wav',
            './uploads/1759095739020-umbrellas.jpg',
            './output.mp4',
            null  // Use audio duration, or specify seconds: 30
        );
        console.log(`MP4 generated: ${outputPath}`);
    } catch (error) {
        console.error('Error:', error.message);
    }
}
main();
// Alternative with fluent-ffmpeg (requires: npm install fluent-ffmpeg)
const ffmpeg = require('fluent-ffmpeg');

function generateMP4Fluent(audioPath, imagePath, outputPath, duration = null) {
    return new Promise((resolve, reject) => {
        let command = ffmpeg()
            .input(imagePath)
            .inputOptions('-loop 1')
            .input(audioPath)
            .videoCodec('libx264')
            .audioCodec('aac')
            .outputOptions('-tune stillimage')
            .outputOptions('-pix_fmt yuv420p')
            .outputOptions('-shortest');

        if (duration) {
            command = command.duration(duration);
        }

        command
            .output(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', reject)
            .run();
    });
}

module.exports = { generateMP4, generateMP4Fluent };
