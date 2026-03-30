// Cart functions
function getCart() {
    return JSON.parse(localStorage.getItem('cart') || '{}');
}

function saveCart(cart) {
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
}

function addToCart(productId, quantity = 1) {
    const cart = getCart();
    cart[productId] = (cart[productId] || 0) + quantity;
    saveCart(cart);
    showNotification('Added to cart!');
}

function removeFromCart(productId) {
    const cart = getCart();
    delete cart[productId];
    saveCart(cart);
    location.reload();
}

function updateCartItem(productId, quantity) {
    const cart = getCart();
    if (quantity <= 0) {
        delete cart[productId];
    } else {
        cart[productId] = quantity;
    }
    saveCart(cart);
}

function getCartItems() {
    const cart = getCart();
    const items = [];
    let total = 0;
    
    // This needs to be async - call from component
    return { items, total };
}

function updateCartCount() {
    const cart = getCart();
    const count = Object.values(cart).reduce((a, b) => a + b, 0);
    const cartCountElements = document.querySelectorAll('.cart-count');
    cartCountElements.forEach(el => el.textContent = count);
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `<i class="fas fa-${type === 'success' ? 'check' : 'exclamation-circle'}"></i> ${message}`;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// Format price
function formatPrice(price) {
    return `KSh ${price.toLocaleString()}`;
}

// Load products on page
document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
});
