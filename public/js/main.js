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
    showNotification('Removed from cart');
    if (window.location.pathname.includes('cart.html')) location.reload();
}

function updateCartCount() {
    const cart = getCart();
    const count = Object.values(cart).reduce((a, b) => a + b, 0);
    document.querySelectorAll('.cart-count').forEach(el => el.textContent = count);
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `<i class="fas fa-${type === 'success' ? 'check' : 'exclamation-circle'}"></i> ${message}`;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

window.searchProducts = function() {
    const query = document.getElementById('searchInput').value.trim();
    if (query) {
        window.location.href = `/category?search=${encodeURIComponent(query)}`;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
});
