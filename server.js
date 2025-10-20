const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const { Keypair } = require('@solana/web3.js');
const { isValidSolanaAddress, validateMintPrice, generateMP4 } = require('./utils');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ 
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024,
        fieldSize: 50 * 1024 * 1024
    }
});

const mints = new Map();
const MINTS_FILE = 'mints.json';

// Load mints from file on startup
async function loadMints() {
    try {
        const data = await fs.readFile(MINTS_FILE, 'utf8');
        const mintsArray = JSON.parse(data);
        mintsArray.forEach(mint => mints.set(mint.id, mint));
        console.log(`Loaded ${mintsArray.length} mints from file`);
    } catch (error) {
        console.log('No existing mints file found, starting fresh');
    }
}

// Save mints to file
async function saveMints() {
    try {
        const mintsArray = Array.from(mints.values());
        await fs.writeFile(MINTS_FILE, JSON.stringify(mintsArray, null, 2));
    } catch (error) {
        console.error('Failed to save mints:', error);
    }
}

app.post('/api/upload-image', upload.single('image'), (req, res) => {
    if (!req.file) return res.json({ success: false, error: 'No image file provided' });
    res.json({ success: true, path: `/uploads/${req.file.filename}`, filename: req.file.filename });
});

app.post('/api/upload-music', upload.single('music'), (req, res) => {
    if (!req.file) return res.json({ success: false, error: 'No music file provided' });
    res.json({ success: true, path: `/uploads/${req.file.filename}`, filename: req.file.filename });
});

app.post('/create-mint', async (req, res) => {
    try {
        const { creatorWallet, mintPrice, pageTitle, pageText, pageImageUrl, title, description, imageUrl, musicUrl, openTime } = req.body;
        
        if (!pageTitle || !pageImageUrl || !title || !imageUrl || !musicUrl || !creatorWallet) {
            return res.json({ success: false, error: 'Missing required fields' });
        }

        // Validate creator wallet
        if (!isValidSolanaAddress(creatorWallet)) {
            return res.json({ success: false, error: 'Invalid creator wallet address' });
        }

        // Validate mint price
        const validatedPrice = validateMintPrice(mintPrice);

        const mintId = Date.now().toString();
        const keypair = Keypair.generate();
        
        // Generate MP4 from image and music
        const imagePath = path.join(__dirname, 'uploads', path.basename(imageUrl));
        const musicPath = path.join(__dirname, 'uploads', path.basename(musicUrl));
        const mp4Filename = `${mintId}-video.mp4`;
        const mp4Path = path.join(__dirname, 'uploads', mp4Filename);
        const mp4Url = `/uploads/${mp4Filename}`;

        console.log(`Generating MP4 for mint ${mintId}...`);

        try {
            await generateMP4(musicPath, imagePath, mp4Path);
            console.log(`MP4 generated successfully: ${mp4Path}`);
        } catch (error) {
            console.error('MP4 generation failed:', error);
            return res.json({ success: false, error: `MP4 generation failed: ${error.message}` });
        }
        
        const mint = {
            id: mintId,
            creatorWallet,
            mintPrice: validatedPrice,
            pageTitle, pageText, pageImageUrl,
            title, description, imageUrl, musicUrl,
            mp4Url,
            openTime: openTime || null,
            keypair: Array.from(keypair.secretKey),
            minted: false,
            createdAt: new Date().toISOString()
        };

        mints.set(mintId, mint);
        await saveMints();
        res.json({ success: true, mintId, assetPubkey: keypair.publicKey.toString() });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.get('/api/mints', (req, res) => {
    const mintList = Array.from(mints.values()).map(mint => {
        const { keypair, title, description, imageUrl, musicUrl, mp4Url, ...publicMint } = mint;
        return publicMint;
    }).reverse();
    res.json({ success: true, mints: mintList });
});

app.get('/mint/:id', (req, res) => {
    const mint = mints.get(req.params.id);
    if (!mint) return res.json({ success: false, error: 'Mint not found' });

    const { keypair, ...mintData } = mint;
    res.json({ success: true, mint: mintData });
});

app.post('/api/create-nft-metadata', async (req, res) => {
    try {
        const { name, image, animation_url, description, mintId } = req.body;
        
        const mint = mints.get(mintId);
        if (!mint || mint.minted) {
            return res.json({ success: false, error: 'Invalid mint or already processed' });
        }
        
        const baseUrl = 'https://r3g1m3n.xyz';
        
        const metadata = {
            name, 
            symbol: "MUSIC",
            description: description || '',
            seller_fee_basis_points: 500,
            image: `${baseUrl}${image}`,
            animation_url: `${baseUrl}${mint.mp4Url}`,
            external_url: baseUrl,
            attributes: [
                { trait_type: 'Type', value: 'Music NFT' },
                { trait_type: 'Creator', value: mint.creatorWallet },
                { trait_type: 'Price', value: `${mint.mintPrice} SOL` }
            ],
            properties: {
                files: [
                    {
                        uri: `${baseUrl}${mint.mp4Url}`,
                        type: 'video/mp4'
                    }
                ],
                category: 'video'
            }
        };
        
        const metadataId = `${mintId}-${Date.now()}`;
        const metadataPath = path.join('uploads', `metadata-${metadataId}.json`);
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
        
        res.json({ success: true, metadataUrl: `${baseUrl}/uploads/metadata-${metadataId}.json` });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.get('/api/keypair/:mintId', (req, res) => {
    const mint = mints.get(req.params.mintId);
    if (!mint) return res.json({ success: false, error: 'Mint not found' });
    if (mint.minted) return res.json({ success: false, error: 'Already minted' });
    if (mint.openTime && new Date() < new Date(mint.openTime)) {
        return res.json({ success: false, error: 'Mint not open yet' });
    }
    
    res.json({ 
        success: true, 
        keypair: mint.keypair,
        assetPubkey: Keypair.fromSecretKey(new Uint8Array(mint.keypair)).publicKey.toString()
    });
});

app.post('/api/mark-minted/:mintId', async (req, res) => {
    const mint = mints.get(req.params.mintId);
    if (!mint) return res.json({ success: false, error: 'Mint not found' });
    if (mint.minted) return res.json({ success: false, error: 'Already minted' });
    
    mint.minted = true;
    mint.txSignature = req.body.txSignature;
    await saveMints();
    res.json({ success: true });
});

// Protected file serving
app.get('/uploads/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'uploads', filename);
    
    if (filename.startsWith('metadata-')) {
        return res.sendFile(filePath);
    }
    
    if (isPageImage(filename)) {
        return res.sendFile(filePath);
    }
    
    const mint = findMintByFile(filename);
    if (!mint) {
        return res.status(404).json({ error: 'File not found' });
    }
    
    if (!mint.minted) {
        return res.status(403).json({ error: 'File not accessible until NFT is minted' });
    }
    
    res.sendFile(filePath);
});

function isPageImage(filename) {
    for (const mint of mints.values()) {
        if (mint.pageImageUrl && mint.pageImageUrl.endsWith(filename)) {
            return true;
        }
    }
    return false;
}

function findMintByFile(filename) {
    for (const mint of mints.values()) {
        const imageMatch = mint.imageUrl && mint.imageUrl.endsWith(filename);
        const musicMatch = mint.musicUrl && mint.musicUrl.endsWith(filename);
        const mp4Match = mint.mp4Url && mint.mp4Url.endsWith(filename);
        if (imageMatch || musicMatch || mp4Match) {
            return mint;
        }
    }
    return null;
}

fs.mkdir('uploads', { recursive: true }).catch(console.error);

loadMints();

app.listen(3000, '0.0.0.0', () => {
    console.log('Server running on http://0.0.0.0:3000');
});
