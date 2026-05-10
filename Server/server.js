const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const MONGODB_URI = process.env.MONGODB_URI;

// Request Logger
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// MongoDB Connection
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('Could not connect to MongoDB', err));

// --- Schemas ---

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

const User = mongoose.model('User', userSchema);

const siteContentSchema = new mongoose.Schema({
  name: String,
  brand: String,
  tagline: String,
  location: String,
  about: String,
  whatsapp: String,
  instagram: String,
  services: [{ title: String, desc: String }],
  stats: [{ num: String, label: String }]
});

const SiteContent = mongoose.model('SiteContent', siteContentSchema);

const folderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  parentFolder: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
  coverImage: { data: Buffer, contentType: String }
});

const Folder = mongoose.model('Folder', folderSchema);

const imageSchema = new mongoose.Schema({
  name: String,
  data: Buffer,
  contentType: String,
  folder: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', required: true }
});

const Image = mongoose.model('Image', imageSchema);

// --- Middleware ---

// --- Middleware ---

const authenticate = (req, res, next) => {
  // Simplified auth: check for a simple header or just allow for now as requested
  const authHeader = req.header('X-Admin-Auth');
  if (authHeader === 'authenticated') {
    next();
  } else {
    res.status(401).send('Access denied. Please login.');
  }
};

// --- Routes ---

// Auth
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).send('Invalid username or password');

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).send('Invalid username or password');

    res.send({ authenticated: true });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Site Content
app.get('/api/content', async (req, res) => {
  // Ensure Admin User Exists
  const adminExists = await User.findOne({ username: 'kirat_interior' });
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('Kirat@2026', 10);
    const admin = new User({ username: 'kirat_interior', password: hashedPassword });
    await admin.save();
    console.log('Admin user created: kirat_interior');
  }

  let content = await SiteContent.findOne();
  if (!content) {
    // Initial data if DB is empty
    content = new SiteContent({
      name: "Handeep Singh",
      brand: "Kirat Interior",
      tagline: "Custom Furniture · Quality Work · Professional Handling",
      location: "Bathinda, Punjab",
      about: "I am Handeep Singh, an interior designer and master craftsman based in Bathinda, Punjab. With years of hands-on experience, I deliver interiors that blend quality craftsmanship with contemporary design — every detail executed with precision and care. From custom wardrobes and modular kitchens to complete bedroom fit-outs, every project is treated as a work of art.",
      whatsapp: "919872593096",
      instagram: "kiratinterior",
      services: [
        { title: "Modular Kitchens", desc: "Custom kitchen design and full installation, tailored to your space." },
        { title: "Custom Wardrobes", desc: "Bespoke sliding and hinged wardrobes built to your dimensions." },
        { title: "Bedroom Interiors", desc: "Complete bedroom fit-outs — beds, panels, lighting, flooring." },
        { title: "Wall Panelling", desc: "Decorative wooden and PVC wall panels adding depth to any room." },
        { title: "Display Units", desc: "Custom TV units, display shelves, and pooja cabinets." },
        { title: "Full Interior Design", desc: "End-to-end interior solutions for homes and commercial spaces." }
      ],
      stats: [
        { num: "10+", label: "Years Experience" },
        { num: "200+", label: "Projects Completed" },
        { num: "100%", label: "Quality Assured" },
        { num: "PAN", label: "Punjab Coverage" }
      ]
    });
    await content.save();
  }
  res.send(content);
});

app.put('/api/content', authenticate, async (req, res) => {
  const content = await SiteContent.findOneAndUpdate({}, req.body, { new: true, upsert: true });
  res.send(content);
});

// Portfolio - Folders
app.get('/api/folders', async (req, res) => {
  const folders = await Folder.find();
  res.send(folders);
});

app.post('/api/folders', authenticate, async (req, res) => {
  const { name, parentFolder } = req.body;
  const folder = new Folder({ name, parentFolder: parentFolder || null });
  await folder.save();
  res.send(folder);
});

app.delete('/api/folders/:id', authenticate, async (req, res) => {
  const folderId = req.params.id;
  
  // Recursively delete subfolders and images
  const deleteFolderRecursive = async (id) => {
    const subfolders = await Folder.find({ parentFolder: id });
    for (let sub of subfolders) {
      await deleteFolderRecursive(sub._id);
    }
    await Image.deleteMany({ folder: id });
    await Folder.findByIdAndDelete(id);
  };

  await deleteFolderRecursive(folderId);
  res.send('Folder and contents deleted');
});

// Portfolio - Images & Covers Setup
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB
});

app.put('/api/folders/:id/cover', authenticate, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).send('No image uploaded');
  const folder = await Folder.findByIdAndUpdate(req.params.id, {
    coverImage: {
      data: req.file.buffer,
      contentType: req.file.mimetype
    }
  }, { new: true });
  res.send(folder);
});

app.get('/api/folders/:id/cover', async (req, res) => {
  const folder = await Folder.findById(req.params.id);
  if (!folder || !folder.coverImage || !folder.coverImage.data) {
    return res.status(404).send('No cover image');
  }
  res.set('Content-Type', folder.coverImage.contentType);
  res.send(folder.coverImage.data);
});

// Portfolio - Images
app.post('/api/images', authenticate, upload.single('image'), async (req, res) => {
  const { name, folderId } = req.body;
  if (!req.file) return res.status(400).send('No image uploaded');

  const image = new Image({
    name: name || req.file.originalname,
    data: req.file.buffer,
    contentType: req.file.mimetype,
    folder: folderId
  });
  await image.save();
  res.send({ _id: image._id, name: image.name });
});

app.get('/api/images/folder/:folderId', async (req, res) => {
  const images = await Image.find({ folder: req.params.folderId }).select('name contentType');
  res.send(images);
});

app.get('/api/images/:id', async (req, res) => {
  const image = await Image.findById(req.params.id);
  if (!image) return res.status(404).send('Image not found');
  res.set('Content-Type', image.contentType);
  res.send(image.data);
});

app.delete('/api/images/:id', authenticate, async (req, res) => {
  await Image.findByIdAndDelete(req.params.id);
  res.send('Image deleted');
});

// Serving main page and admin page
app.use(express.static(path.join(__dirname, '..')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'webpage.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Error handler for Multer
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).send('File too large. Max limit is 15MB.');
    }
  }
  res.status(500).send(err.message);
});
