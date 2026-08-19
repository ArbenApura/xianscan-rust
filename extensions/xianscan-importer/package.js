import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { resolve, join, relative } from 'path';
import { deflateRawSync } from 'zlib';

if (!existsSync('store')) mkdirSync('store', { recursive: true });

const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
const version = manifest.version;
const zipFilename = `xianscan-importer-v${version}.zip`;
const xpiFilename = `xianscan-importer-firefox-v${version}.xpi`;

const distPath = resolve('dist');
const distFirefoxPath = resolve('dist-firefox');
const zipPath = resolve('store', zipFilename);
const xpiPath = resolve('store', xpiFilename);

// CRC32 table & calculation
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
	let c = i;
	for (let k = 0; k < 8; k++) {
		c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
	}
	crcTable[i] = c >>> 0;
}

function calcCrc32(buf) {
	let crc = 0 ^ (-1);
	for (let i = 0; i < buf.length; i++) {
		crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
	}
	return (crc ^ (-1)) >>> 0;
}

function getFilesRecursively(dir) {
	const files = [];
	function walk(current) {
		for (const entry of readdirSync(current)) {
			const full = join(current, entry);
			if (statSync(full).isDirectory()) {
				walk(full);
			} else {
				files.push(full);
			}
		}
	}
	walk(dir);
	return files;
}

function createZipArchive(sourceDir, outputFile) {
	const files = getFilesRecursively(sourceDir);
	const entries = [];
	let offset = 0;
	const localChunks = [];

	for (const fullPath of files) {
		const relPath = relative(sourceDir, fullPath).replace(/\\/g, '/');
		const uncompressed = readFileSync(fullPath);
		const compressed = deflateRawSync(uncompressed, { level: 9 });
		const crc = calcCrc32(uncompressed);
		const nameBuf = Buffer.from(relPath, 'utf8');

		// Local File Header
		const localHeader = Buffer.alloc(30);
		localHeader.writeUInt32LE(0x04034b50, 0); // Signature
		localHeader.writeUInt16LE(20, 4);         // Version needed
		localHeader.writeUInt16LE(0, 6);          // General purpose bit flag
		localHeader.writeUInt16LE(8, 8);          // Compression method (8 = Deflate)
		localHeader.writeUInt16LE(0, 10);         // Mod time
		localHeader.writeUInt16LE(0, 12);         // Mod date
		localHeader.writeUInt32LE(crc, 14);        // CRC-32
		localHeader.writeUInt32LE(compressed.length, 18);   // Compressed size
		localHeader.writeUInt32LE(uncompressed.length, 22); // Uncompressed size
		localHeader.writeUInt16LE(nameBuf.length, 26);      // File name length
		localHeader.writeUInt16LE(0, 28);                   // Extra field length

		entries.push({
			relPath,
			nameBuf,
			crc,
			compressedSize: compressed.length,
			uncompressedSize: uncompressed.length,
			offset
		});

		localChunks.push(localHeader, nameBuf, compressed);
		offset += localHeader.length + nameBuf.length + compressed.length;
	}

	const centralChunks = [];
	let centralDirSize = 0;

	for (const entry of entries) {
		const centralHeader = Buffer.alloc(46);
		centralHeader.writeUInt32LE(0x02014b50, 0); // Central file header signature
		centralHeader.writeUInt16LE(20, 4);         // Version made by
		centralHeader.writeUInt16LE(20, 6);         // Version needed
		centralHeader.writeUInt16LE(0, 8);          // General purpose bit flag
		centralHeader.writeUInt16LE(8, 10);         // Compression method (8 = Deflate)
		centralHeader.writeUInt16LE(0, 12);         // Mod time
		centralHeader.writeUInt16LE(0, 14);         // Mod date
		centralHeader.writeUInt32LE(entry.crc, 16); // CRC-32
		centralHeader.writeUInt32LE(entry.compressedSize, 20);   // Compressed size
		centralHeader.writeUInt32LE(entry.uncompressedSize, 24); // Uncompressed size
		centralHeader.writeUInt16LE(entry.nameBuf.length, 28);   // File name length
		centralHeader.writeUInt16LE(0, 30);                      // Extra field length
		centralHeader.writeUInt16LE(0, 32);                      // Comment length
		centralHeader.writeUInt16LE(0, 34);                      // Disk number start
		centralHeader.writeUInt16LE(0, 36);                      // Internal file attributes
		centralHeader.writeUInt32LE(0, 38);                      // External file attributes
		centralHeader.writeUInt32LE(entry.offset, 42);           // Relative offset of local header

		centralChunks.push(centralHeader, entry.nameBuf);
		centralDirSize += centralHeader.length + entry.nameBuf.length;
	}

	// End of Central Directory Record
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
	eocd.writeUInt16LE(0, 4);          // Number of this disk
	eocd.writeUInt16LE(0, 6);          // Disk with central directory
	eocd.writeUInt16LE(entries.length, 8);  // Total entries on this disk
	eocd.writeUInt16LE(entries.length, 10); // Total entries in central directory
	eocd.writeUInt32LE(centralDirSize, 12); // Size of central directory
	eocd.writeUInt32LE(offset, 16);         // Offset of central directory
	eocd.writeUInt16LE(0, 20);              // Comment length

	const finalZip = Buffer.concat([...localChunks, ...centralChunks, eocd]);
	try {
		writeFileSync(outputFile, finalZip);
	} catch {
		try {
			unlinkSync(outputFile);
			writeFileSync(outputFile, finalZip);
		} catch {
			console.warn(`Note: ${outputFile} is currently locked by Firefox.`);
		}
	}
}

// 1. Package Universal / Chromium ZIP
createZipArchive(distPath, zipPath);

// 2. Package Firefox XPI
createZipArchive(distFirefoxPath, xpiPath);

console.log(`Packaged Universal (Chrome/Edge/Brave): store/${zipFilename}`);
console.log(`Packaged Firefox (Add-on XPI):          store/${xpiFilename}`);
