import { defaultSiteContent } from "./site-content.js";

export let products = defaultSiteContent.products.map(product => ({ ...product }));
let storefrontCopy = defaultSiteContent;

export let cart = [];
let currentFilter = 'all';

export function setProducts(updatedProducts) {
    products = updatedProducts.map(product => ({ ...product }));
    renderProducts(currentFilter, document.getElementById('search-input')?.value || '');
}

export function setStorefrontCopy(copy) {
    storefrontCopy = copy;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

// Render Product Grid
export function renderProducts(filter = 'all', searchQuery = '') {
    const grid = document.getElementById('product-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    const filtered = products.filter(p => {
        const matchesCat = filter === 'all' || p.category === filter;
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.desc.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCat && matchesSearch;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-12 text-slate-500">${escapeHtml(storefrontCopy.noProductsMessage)}</div>`;
        return;
    }

    filtered.forEach(p => {
        grid.innerHTML += `
            <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-sm hover:shadow-md transition flex flex-col justify-between product-card">
                <div class="p-6">
                    <div class="text-4xl mb-4 bg-brand-50 w-16 h-16 rounded-2xl flex items-center justify-center">${escapeHtml(p.image)}</div>
                    <span class="text-xs font-bold uppercase tracking-wider text-brand-600 bg-brand-50 px-2.5 py-1 rounded-md">${escapeHtml(p.category)}</span>
                    <h3 class="text-xl font-bold text-white mt-2">${escapeHtml(p.name)}</h3>
                    <p class="text-slate-300 text-xs mt-1 leading-relaxed">${escapeHtml(p.desc)}</p>
                </div>
                <div class="p-6 pt-0 flex items-center justify-between border-t border-slate-800 mt-4">
                    <div>
                        <span class="text-xs text-slate-400 block">${escapeHtml(storefrontCopy.productPriceLabel)}</span>
                        <span class="text-lg font-extrabold text-white">₱${Number(p.price).toLocaleString()} <span class="text-xs font-normal text-slate-400">${escapeHtml(p.unit)}</span></span>
                    </div>
                    <button onclick="addToCart(${p.id})" class="bg-brand-600 hover:bg-brand-700 text-white w-10 h-10 rounded-xl flex items-center justify-center font-bold transition shadow-sm">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                </div>
            </div>
        `;
    });
}

// Category Filter
export function filterCategory(cat, eventTarget) {
    currentFilter = cat;
    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.classList.remove('bg-brand-600', 'text-white');
        btn.classList.add('bg-slate-900', 'text-slate-300', 'border', 'border-slate-700');
    });
    if (eventTarget) {
        eventTarget.classList.remove('bg-slate-900', 'text-slate-300', 'border', 'border-slate-700');
        eventTarget.classList.add('bg-brand-600', 'text-white');
    }
    const searchVal = document.getElementById('search-input')?.value || '';
    renderProducts(cat, searchVal);
}

// Search Handler
export function searchProducts() {
    const query = document.getElementById('search-input')?.value || '';
    renderProducts(currentFilter, query);
}

// Cart Operations
export function addToCart(id) {
    const product = products.find(p => p.id === id);
    const existing = cart.find(item => item.id === id);
    if (existing) existing.qty += 1;
    else cart.push({ ...product, qty: 1 });
    updateCartUI();
    openCart();
}

export function updateCartUI() {
    const container = document.getElementById('cart-items-container');
    const badge = document.getElementById('cart-badge');
    const totalEl = document.getElementById('cart-total');
    if (!container || !badge || !totalEl) return;
    
    badge.innerText = cart.reduce((sum, item) => sum + item.qty, 0);

    if (cart.length === 0) {
        container.innerHTML = `<div class="text-center text-slate-400 py-12">${escapeHtml(storefrontCopy.cartEmpty)}</div>`;
        totalEl.innerText = "₱0.00";
        return;
    }

    container.innerHTML = '';
    let total = 0;

    cart.forEach((item, index) => {
        total += item.price * item.qty;
        container.innerHTML += `
            <div class="flex items-center justify-between bg-slate-800 p-4 rounded-xl border border-slate-700">
                <div>
                    <h4 class="font-bold text-sm text-white">${escapeHtml(item.name)}</h4>
                    <span class="text-xs text-slate-400">₱${Number(item.price).toLocaleString()} ${escapeHtml(item.unit)}</span>
                </div>
                <div class="flex items-center gap-3">
                    <div class="flex items-center border border-slate-700 rounded-lg bg-slate-900">
                        <button onclick="changeQty(${index}, -1)" class="px-2.5 py-1 text-slate-300 hover:bg-slate-700">-</button>
                        <span class="px-3 text-sm font-bold">${item.qty}</span>
                        <button onclick="changeQty(${index}, 1)" class="px-2.5 py-1 text-slate-300 hover:bg-slate-700">+</button>
                    </div>
                    <button onclick="removeItem(${index})" class="text-red-500 hover:text-red-700 text-sm"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `;
    });
    totalEl.innerText = `₱${total.toLocaleString()}`;
}

export function changeQty(index, delta) {
    cart[index].qty += delta;
    if (cart[index].qty <= 0) cart.splice(index, 1);
    updateCartUI();
}

export function removeItem(index) {
    cart.splice(index, 1);
    updateCartUI();
}

export function openCart() { document.getElementById('cart-drawer')?.classList.remove('hidden'); }
export function closeCart() { document.getElementById('cart-drawer')?.classList.add('hidden'); }

// Send via WhatsApp/Viber
export function sendViaWhatsApp() {
    if (cart.length === 0) { alert(storefrontCopy.emptyCartAlert); return; }
    const name = document.getElementById('order-name')?.value.trim() || 'Valued Customer';
    const phone = document.getElementById('order-phone')?.value.trim() || 'N/A';
    const orderType = document.getElementById('order-type')?.value || 'Retail';

    let msg = `*${storefrontCopy.whatsappOrderTitle}*\n`;
    msg += `*${storefrontCopy.whatsappNameLabel}:* ${name}\n`;
    msg += `*${storefrontCopy.whatsappContactLabel}:* ${phone}\n`;
    msg += `*${storefrontCopy.whatsappTypeLabel}:* ${orderType}\n\n*${storefrontCopy.whatsappItemsLabel}:*\n`;
    
    cart.forEach(i => {
        msg += `- ${i.name} (${i.qty}x) @ ₱${i.price}\n`;
    });

    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    msg += `\n*${storefrontCopy.whatsappTotalLabel}:* ₱${total.toLocaleString()}`;

    const query = new URLSearchParams({ text: msg });
    window.open(`https://wa.me/${encodeURIComponent(storefrontCopy.whatsAppNumber)}?${query}`, '_blank');
}

// Global scope bindings for inline HTML handlers
window.addToCart = addToCart;
window.filterCategory = (cat, target) => filterCategory(cat, target);
window.searchProducts = searchProducts;
window.changeQty = changeQty;
window.removeItem = removeItem;
window.openCart = openCart;
window.closeCart = closeCart;
window.sendViaWhatsApp = sendViaWhatsApp;