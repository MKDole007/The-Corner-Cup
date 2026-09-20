require('dotenv').config()
const express = require('express')
const mongoose = require('mongoose')
const path = require('path')
const crypto = require('crypto')
const os = require('os')
const port = process.env.PORT || 3019
const host = '0.0.0.0'

const app = express()

const productCatalog = new Map([
    ['Black coffee', 99],
    ['Red velvet pastry', 199],
    ['Sprinkle Donut', 149],
    ['Crispy Club Sandwich', 199],
    ['Cappuccino', 299],
    ['Cold Coffee', 179],
    ['Vanilla Frappe', 245],
    ['Panner Tikka Sandwich', 200],
    ['Margherita Pizza', 799],
    ['Veg Burger', 149],
    ['Lemon Tea', 200],
    ['Masala Tea', 69],
    ['Cinnamon Roll', 400],
    ['Garlic Bread', 199],
    ['Peri Peri French Fries', 129],
    ['Hot Chocolate', 209],
    ['Glade Donut', 169]
])

app.use(express.static(path.join(__dirname)))
app.use(express.json())
app.use((req, res, next) => {
    const origin = req.headers.origin

    if (origin === 'null' || (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) {
        res.setHeader('Access-Control-Allow-Origin', origin)
        res.setHeader('Vary', 'Origin')
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
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

const adminSessions = new Map()
const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
const adminPassword = process.env.ADMIN_PASSWORD
const adminSessionLifetime = 8 * 60 * 60 * 1000

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex')
    return `${salt}:${hash}`
}

function passwordMatches(password, storedPassword) {
    const [salt, storedHash] = storedPassword.split(':')
    if (!salt || !storedHash || storedHash.length !== 128) return false
    const hash = crypto.scryptSync(password, salt, 64).toString('hex')
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'))
}

function requireAdmin(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '')
    const createdAt = token && adminSessions.get(token)
    if (!createdAt || Date.now() - createdAt > adminSessionLifetime) {
        if (token) adminSessions.delete(token)
        return res.status(401).json({ message: 'Admin authentication required.' })
    }
    next()
}

app.post('/api/admin/login', (req, res) => {
    if (!adminEmail || !adminPassword) {
        return res.status(503).json({ message: 'Admin login is not configured.' })
    }
    const email = req.body.email?.trim().toLowerCase()
    const password = req.body.password || ''
    if (email !== adminEmail || password !== adminPassword) {
        return res.status(401).json({ message: 'Invalid admin credentials.' })
    }
    const token = crypto.randomBytes(32).toString('hex')
    adminSessions.set(token, Date.now())
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
            { returnDocument: 'after' }
        ).lean()
        if (!order) return res.status(404).json({ message: 'Order not found.' })
        const user = await User.findOne({ email: order.customerEmail })
        if (user) {
            const orderId = order._id.toString()
            const matchingOrder = user.orders.find(savedOrder =>
                savedOrder.orderId === orderId || savedOrder.date === order.orderData.date
            )
            if (matchingOrder) {
                matchingOrder.status = order.status
                user.markModified('orders')
                await user.save()
            }
        }
        res.json(order)
    } catch (error) {
        res.status(400).json({ message: 'Invalid order ID.' })
    }
})

app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body
        if (typeof name !== 'string' || name.trim().length < 2 ||
            typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email.trim()) ||
            typeof password !== 'string' || password.length < 8) {
            return res.status(400).json({ message: 'Use a valid name, email, and password of at least 8 characters.' })
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
        const { email, orderData } = req.body
        if (!email || !orderData || !Array.isArray(orderData.items) || !orderData.items.length) {
            return res.status(400).json({ message: 'Email and orderData are required.' })
        }

        if (orderData.items.length > 50) {
            return res.status(400).json({ message: 'Order contains too many items.' })
        }

        let items
        try {
            items = orderData.items.map(item => {
                const name = typeof item.name === 'string' ? item.name.trim() : ''
                const quantity = Number(item.quantity)
                const price = productCatalog.get(name)
                if (!price || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
                    throw new Error('Invalid order item.')
                }
                return { name, price, quantity, image: typeof item.image === 'string' ? item.image : '' }
            })
        } catch (error) {
            return res.status(400).json({ message: 'One or more order items are invalid.' })
        }

        const user = await User.findOne({ email: email.trim().toLowerCase() })
        if (!user) {
            return res.status(404).json({ message: 'User not found.' })
        }

        const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
        const requestedDiscount = Number(orderData.discount || 0)
        const appliedPoints = Number.isInteger(requestedDiscount) ? requestedDiscount : 0
        if (appliedPoints < 0 || appliedPoints > Math.min(user.points || 0, subtotal)) {
            return res.status(400).json({ message: 'Invalid points discount.' })
        }

        const total = subtotal - appliedPoints
        const earnedPoints = Math.floor(total / 10)
        const updatedPoints = Math.max(0, (user.points || 0) - appliedPoints + earnedPoints)
        const normalizedOrder = {
            items,
            quantityTotal: items.reduce((sum, item) => sum + item.quantity, 0),
            subtotal,
            discount: appliedPoints,
            total,
            date: new Date().toISOString(),
            status: 'new'
        }

        user.points = updatedPoints
        const order = await Order.create({
            customerEmail: user.email,
            customerName: user.name,
            orderData: normalizedOrder
        })
        normalizedOrder.orderId = order._id.toString()
        user.orders.push(normalizedOrder)
        await user.save()

        res.json({ name: user.name, email: user.email, orders: user.orders, points: user.points })
    } catch (error) {
        res.status(500).json({ message: 'Unable to process order.' })
    }
})

app.get('/api/orders/status', async (req, res) => {
    const email = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : ''
    if (!email) return res.status(400).json({ message: 'Email is required.' })

    try {
        const user = await User.findOne({ email }).select('orders points').lean()
        if (!user) return res.status(404).json({ message: 'User not found.' })
        res.json({ orders: user.orders, points: user.points })
    } catch (error) {
        res.status(500).json({ message: 'Unable to load order statuses.' })
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