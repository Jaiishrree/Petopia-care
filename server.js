const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = 5000;
const secretKey = 'your_secret_key'; // Replace with your secret key

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/authSystem', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'Connection error:'));
db.once('open', () => console.log('Connected to MongoDB'));

const feedbackSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { 
        type: String, 
        required: true, 
        trim: true, 
        match: [/.+\@.+\..+/, 'Please enter a valid email'] 
    },
    feedback: { type: String, required: true, trim: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    submittedAt: { type: Date, default: Date.now }
});

const Feedback = mongoose.model('Feedback', feedbackSchema);

module.exports = Feedback;

// User schema and model
const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    avatar: { type: String, default: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRtRs_rWILOMx5-v3aXwJu7LWUhnPceiKvvDg&s' }, // Replace with a default avatar URL
    addresses: [
        {
            _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
            label: String,
            street: String,
            city: String,
            state: String,
            zip: String,
            country: String
        }
    ]
});
const User = mongoose.model('User', userSchema);

// Cart schema and model


// Register endpoint
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, email, password: hashedPassword });
        await newUser.save();

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error', error });
    }
});

// Login endpoint
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user._id, username: user.username, email: user.email },
            secretKey,
            { expiresIn: '7d' }
        );

        res.status(200).json({ message: 'Login successful', token });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error', error });
    }
});

// Middleware to verify JWT
const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    jwt.verify(token, secretKey, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Profile endpoint
app.get('/profile', authenticateJWT, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password'); // Exclude password
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json({ data: user });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error', error });
    }
});

// Update avatar endpoint
app.post('/update-avatar', authenticateJWT, async (req, res) => {
    const { avatar } = req.body;

    if (!avatar) {
        return res.status(400).json({ message: 'Avatar URL is required' });
    }

    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.avatar = avatar;
        await user.save();

        res.status(200).json({ message: 'Avatar updated successfully', avatar: user.avatar });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error', error });
    }
});

// Cart endpoints
// Add item to cart
// Cart Schema
const cartSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [
        {
            name: String,
            image: String,
            price: Number,
            quantity: { type: Number, default: 1 }
        }
    ]
});
const Cart = mongoose.model('Cart', cartSchema);

// Add item to cart
app.post('/cart/add', authenticateJWT, async (req, res) => {
    try {
        const { name, image, price } = req.body;
        const userId = req.user.id;

        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({ userId, items: [] });
        }

        const existingItem = cart.items.find(item => item.name === name);
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            cart.items.push({ name, image, price, quantity: 1 });
        }

        await cart.save();
        res.status(200).json({ message: 'Item added to cart' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error', error });
    }
});

// Get user cart
app.get('/cart', authenticateJWT, async (req, res) => {
    try {
        const cart = await Cart.findOne({ userId: req.user.id });
        res.status(200).json(cart ? cart.items : []);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error', error });
    }
});

// Remove item from cart
app.post('/cart/remove', authenticateJWT, async (req, res) => {
    try {
        const { name } = req.body;
        const userId = req.user.id;

        let cart = await Cart.findOne({ userId });
        if (!cart) return res.status(404).json({ message: 'Cart not found' });

        cart.items = cart.items.filter(item => item.name !== name);
        await cart.save();

        res.status(200).json({ message: 'Item removed from cart' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error', error });
    }
});

// Fetch all addresses
app.get('/addresses', authenticateJWT, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.status(200).json({ addresses: user.addresses });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error', error });
    }
});

// Add a new address
app.post('/addresses', authenticateJWT, async (req, res) => {
    const { label, street, city, state, zip, country } = req.body;
    if (!street || !city || !state || !zip || !country) {
        return res.status(400).json({ message: 'All address fields are required' });
    }
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        user.addresses.push({ label, street, city, state, zip, country });
        await user.save();
        res.status(201).json({ message: 'Address added successfully', addresses: user.addresses });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error', error });
    }
});

// Edit an existing address
app.put('/addresses/:id', authenticateJWT, async (req, res) => {
    const { label, street, city, state, zip, country } = req.body;
    const addressId = req.params.id;
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        const address = user.addresses.id(addressId);
        if (!address) return res.status(404).json({ message: 'Address not found' });
        if (label) address.label = label;
        if (street) address.street = street;
        if (city) address.city = city;
        if (state) address.state = state;
        if (zip) address.zip = zip;
        if (country) address.country = country;
        await user.save();
        res.status(200).json({ message: 'Address updated successfully', addresses: user.addresses });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error', error });
    }
});

// Delete an address
app.delete('/addresses/:id', authenticateJWT, async (req, res) => {
    const addressId = req.params.id;
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        user.addresses = user.addresses.filter(addr => addr._id.toString() !== addressId);
        await user.save();
        res.status(200).json({ message: 'Address deleted successfully', addresses: user.addresses });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error', error });
    }
});

// Place order
app.post('/place-order', authenticateJWT, async (req, res) => {
    const { address, cart, paymentMethod } = req.body;
    try {
        if (!cart || !cart.length) return res.status(400).json({ error: 'Cart is empty' });

        const order = new Order({
            userId: req.user.id,
            address,
            items: cart,
            paymentMethod,
        });

        await order.save();
        await Cart.deleteOne({ userId: req.user.id }); // Clear cart after order
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: 'Error placing order' });
    }
});

// Checkout endpoint
app.post('/checkout', authenticateJWT, async (req, res) => {
    const { addressId } = req.body;
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        const selectedAddress = user.addresses.id(addressId);
        if (!selectedAddress) return res.status(404).json({ message: 'Address not found' });
        res.status(200).json({ message: 'Order placed successfully', address: selectedAddress });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error', error });
    }
});

// Serve confirmation page with data
app.get('/confirmation', authenticateJWT, async (req, res) => {
    try {
        // Find the user
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Ensure the user has addresses
        if (!user.addresses || user.addresses.length === 0) {
            return res.status(400).json({ message: 'No addresses available for the user' });
        }

        // Get the user's selected address (for simplicity, assume it's the first one)
        const selectedAddress = user.addresses[0]; // Adjust if you want to allow address selection

        // Fetch the cart and ensure it has items
        const cart = await Cart.findOne({ userId: req.user.id });
        if (!cart || !cart.items || cart.items.length === 0) {
            return res.status(400).json({ message: 'Cart is empty' });
        }

        // For simplicity, let's assume the payment method is hardcoded; you can modify it as needed
        const paymentMethod = req.body.paymentMethod || 'Cash on Delivery';  // Adjust if payment method is passed

        // Send the confirmation page data
        res.status(200).json({
            address: selectedAddress,
            items: cart.items,
            paymentMethod
        });
    } catch (error) {
        console.error('Error in /confirmation:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }
});

// CartItem Schema
const cartItemSchema = new mongoose.Schema({
    name: String,
    quantity: Number,
    price: Number
});

// PendingOrder Schema
const pendingOrderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    address: {
        label: String,
        street: String,
        city: String,
        state: String,
        zip: String,
        country: String
    },
    items: [cartItemSchema],
    paymentMethod: String,
    transactionId: { type: String, default: null },
    status: { type: String, default: 'Pending' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// ConfirmedOrder Schema
const confirmedOrderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    address: {
        label: String,
        street: String,
        city: String,
        state: String,
        zip: String,
        country: String
    },
    items: [cartItemSchema],
    paymentMethod: String,
    transactionId: String,
    paymentStatus: { type: String, default: 'Completed' },
    confirmedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

// Create Models
const PendingOrder = mongoose.model('PendingOrder', pendingOrderSchema);
const ConfirmedOrder = mongoose.model('ConfirmedOrder', confirmedOrderSchema);

module.exports = { PendingOrder, ConfirmedOrder };


app.get('/admin/users', async (req, res) => {
    try {
        const users = await User.find({}, 'username email avatar'); // Fetch all users (excluding passwords)
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error', error });
    }
});

app.delete('/admin/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const deletedUser = await User.findByIdAndDelete(userId);

        if (!deletedUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ message: 'User removed successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error', error });
    }
});


app.get('/admin/stats', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalOrders = await Order.countDocuments(); // Assuming you have an Order model

        res.status(200).json({ totalUsers, totalOrders });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error', error });
    }
});

app.get('/admin/user-orders', async (req, res) => {
    try {
        const users = await User.find({}, 'username email');
        const orders = await Order.find({}, 'userId');

        const userOrders = users.map(user => {
            const orderCount = orders.filter(order => order.userId.toString() === user._id.toString()).length;
            return { username: user.username, email: user.email, orderCount };
        });

        res.status(200).json(userOrders);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error', error });
    }
});

// POST route to handle the feedback form submission
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: 'carepetopia@gmail.com',  // Admin's email
        pass: 'lckn kebj nqlw ruyj'           // App password for security
    }
});

app.post('/submit-feedback', async (req, res) => {
    try {
        const { name, email, feedback, rating } = req.body;

        const newFeedback = new Feedback({
            name,
            email,
            feedback,
            rating
        });

        await newFeedback.save();

        // Email to Admin
        const adminMailOptions = {
            from: email,
            to: 'carepetopia@gmail.com',  // Admin's email
            subject: 'New Feedback Received',
            html: `<h3>New Feedback Submission</h3>
                   <p><strong>Name:</strong> ${name}</p>
                   <p><strong>Email:</strong> ${email}</p>
                   <p><strong>Feedback:</strong> ${feedback}</p>
                   <p><strong>Rating:</strong> ${rating} / 5</p>
                   <br>
                   <p>Please review this feedback and respond if needed.</p>`
        };

        await transporter.sendMail(adminMailOptions);

        // Email to User
        let userMessage = `<p>Thank you for your feedback! 😊</p>`;
        if (rating == 1 || rating == 2) {
            userMessage = `<p>Thank you for your feedback. We noticed your experience was unsatisfactory, and our team will contact you as soon as possible to resolve any concerns. 🙏</p>`;
        }

        const userMailOptions = {
            from: 'carepetopia@gmail.com',
            to: email,  // User's email
            subject: 'Thank You for Your Feedback!',
            html: `<h3>Hi ${name},</h3>
                   ${userMessage}
                   <p><strong>Your Feedback:</strong> ${feedback}</p>
                   <p><strong>Rating:</strong> ${rating} / 5</p>
                   <br>
                   <p>We appreciate your time and effort to help us improve.</p>
                   <p>Best regards,<br>Petopia Care Team</p>`
        };

        await transporter.sendMail(userMailOptions);

        res.redirect('/homepage.html'); // Redirect after submission
    } catch (error) {
        console.error('Error saving feedback or sending email:', error);
        res.status(500).send('Error saving feedback');
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'homepage.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
