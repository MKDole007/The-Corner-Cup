const express = require('express')
const mongoose = require('mongoose')
const path = require('path')
const crypto = require('crypto')
const os = require('os')
const port = process.env.PORT || 3019
const host = '0.0.0.0'

const app = express()

app.use(express.static(path.join(__dirname)))
app.use(express.json())
app.use((req, res, next) => {
    const origin = req.headers.origin

    if (origin?.startsWith('http://localhost:')) {
        res.setHeader('Access-Control-Allow-Origin', origin)
        res.setHeader('Vary', 'Origin')
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    }

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204)
    }

    next()
})

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    orders: { type: Array, default: [] },
    points: { type: Number, default: 0 }
})

const User = mongoose.model('User', userSchema)
const orderSchema = new mongoose.Schema({
    customerEmail: { type: String, required: true, lowercase: true, trim: true },
    customerName: { type: String, required: true, trim: true },
    orderData: { type: mongoose.Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['new', 'preparing', 'ready', 'completed', 'cancelled'], default: 'new' }
}, { timestamps: true })
const Order = mongoose.model('Order', orderSchema)

const adminSessions = new Set()
const adminEmail = (process.env.ADMIN_EMAIL || 'admin@cornercup.local').trim().toLowerCase()
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex')
    return `${salt}:${hash}`
}

function passwordMatches(password, storedPassword) {
    const [salt, storedHash] = storedPassword.split(':')
    const hash = crypto.scryptSync(password, salt, 64).toString('hex')
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'))
}

function requireAdmin(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token || !adminSessions.has(token)) {
        return res.status(401).json({ message: 'Admin authentication required.' })
    }
    next()
}

app.post('/api/admin/login', (req, res) => {
    const email = req.body.email?.trim().toLowerCase()
    const password = req.body.password || ''
    if (email !== adminEmail || password !== adminPassword) {
        return res.status(401).json({ message: 'Invalid admin credentials.' })
    }
    const token = crypto.randomBytes(32).toString('hex')
    adminSessions.add(token)
    res.json({ token })
})

app.post('/api/admin/logout', requireAdmin, (req, res) => {
    adminSessions.delete(req.headers.authorization.replace('Bearer ', ''))
    res.sendStatus(204)
})

app.get('/api/admin/orders', requireAdmin, async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 }).lean()
        res.json(orders)
    } catch (error) {
        res.status(500).json({ message: 'Unable to load orders.' })
    }
})

app.patch('/api/admin/orders/:id', requireAdmin, async (req, res) => {
    const allowedStatuses = ['new', 'preparing', 'ready', 'completed', 'cancelled']
    if (!allowedStatuses.includes(req.body.status)) {
        return res.status(400).json({ message: 'Invalid order status.' })
    }
    try {
        const order = await Order.findByIdAndUpdate(
            req.params.id,
            { status: req.body.status },
            { new: true }
        ).lean()
        if (!order) return res.status(404).json({ message: 'Order not found.' })
        res.json(order)
    } catch (error) {
        res.status(400).json({ message: 'Invalid order ID.' })
    }
})

app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Name, email, and password are required.' })
        }

        const normalizedEmail = email.trim().toLowerCase()
        const existingUser = await User.findOne({ email: normalizedEmail })
        if (existingUser) {
            return res.status(409).json({ message: 'Account with this email already exists.' })
        }

        const user = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            password: hashPassword(password)
        })

        res.status(201).json({ name: user.name, email: user.email, orders: user.orders, points: user.points })
    } catch (error) {
        res.status(500).json({ message: 'Unable to create account.' })
    }
})

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body
        const user = await User.findOne({ email: email?.trim().toLowerCase() })

        if (!user || !passwordMatches(password || '', user.password)) {
            return res.status(401).json({ message: 'Invalid email or password.' })
        }

        res.json({ name: user.name, email: user.email, orders: user.orders, points: user.points })
    } catch (error) {
        res.status(500).json({ message: 'Unable to log in.' })
    }
})

app.post('/api/order', async (req, res) => {
    try {
        const { email, orderData, earnedPoints, appliedPoints } = req.body
        if (!email || !orderData) {
            return res.status(400).json({ message: 'Email and orderData are required.' })
        }

        const user = await User.findOne({ email: email.trim().toLowerCase() })
        if (!user) {
            return res.status(404).json({ message: 'User not found.' })
        }

        let updatedPoints = user.points || 0
        updatedPoints -= (appliedPoints || 0)
        updatedPoints += (earnedPoints || 0)

        user.points = updatedPoints
        user.orders.push(orderData)
        await user.save()
        await Order.create({
            customerEmail: user.email,
            customerName: user.name,
            orderData
        })

        res.json({ name: user.name, email: user.email, orders: user.orders, points: user.points })
    } catch (error) {
        res.status(500).json({ message: 'Unable to process order.' })
    }
})

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/login')
    .then(() => console.log('Connected to MongoDB'))
    .catch(error => console.error('MongoDB connection failed:', error.message))

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'))
})

app.listen(port, host, () => {
    console.log(`Server is running at http://localhost:${port}`)

    const interfaces = os.networkInterfaces()
    const networkAddresses = Object.entries(interfaces)
        .filter(([name]) => !name.toLowerCase().includes('vethernet') && !name.toLowerCase().includes('wsl'))
        .flatMap(([, addrs]) => addrs)
        .filter(address => address && address.family === 'IPv4' && !address.internal)

    networkAddresses.forEach(address => {
        console.log(`Open on your phone: http://${address.address}:${port}`)
    })
})