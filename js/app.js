import { defaultSiteContent } from "./site-content.js";

export let products = defaultSiteContent.products.map(product => ({ ...product }));
let storefrontCopy = defaultSiteContent;

export let cart = [];
let currentFilter = 'all';
const automaticWholesaleProducts = new Set(["Hungarian Cheese", "Hungarian Spicy"]);

function priceForOrderType(product, orderType, quantity = 1) {
    const automaticWholesale = automaticWholesaleProducts.has(product.name) && quantity >= 10;
    return (orderType === 'Wholesale' || automaticWholesale)
        && product.wholesalePrice !== null
        && product.wholesalePrice !== undefined
        ? Number(product.wholesalePrice)
        : Number(product.price);
}

const categoryLabels = {
    beef: "Beef",
    wagyu: "Wagyu Cubes",
    sausages: "Sausages",
    "imported-steaks": "Imported Steaks",
    "local-steaks": "Local Steaks",
    seafood: "Seafoods"
};

export function setProducts(updatedProducts) {
    products = updatedProducts.map(product => ({ ...product }));
    if (currentFilter !== 'all' && !products.some(product => product.category === currentFilter)) {
        currentFilter = 'all';
    }
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

function renderCategoryFilters() {
    const container = document.getElementById('category-filters');
    if (!container) return;

    const categories = [...new Set(products.map(product => product.category))];
    container.replaceChildren();
    for (const [category, label] of [['all', storefrontCopy.filterAll], ...categories.map(value => [
        value,
        categoryLabels[value] || value
    ])]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cat-btn px-5 py-2.5 rounded-xl font-semibold text-sm transition shadow-sm';
        button.textContent = label;
        button.setAttribute('aria-pressed', String(currentFilter === category));
        button.addEventListener('click', () => filterCategory(category, button));
        if (currentFilter === category) {
            button.classList.add('bg-brand-600', 'text-white');
        } else {
            button.classList.add('bg-slate-900', 'text-slate-300', 'border', 'border-slate-700', 'hover:bg-slate-800');
        }
        container.append(button);
    }
}

export function renderProducts(filter = 'all', searchQuery = '') {
    const grid = document.getElementById('product-grid');
    if (!grid) return;
    renderCategoryFilters();
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

    const categories = [...new Set(filtered.map(product => product.category))];
    const orderType = document.getElementById('order-type')?.value || 'Retail';
    categories.forEach(category => {
        const categoryProducts = filtered.filter(product => product.category === category);
        const cards = categoryProducts.map(p => {
            const cartQuantity = cart.find(item => item.id === p.id)?.qty || 1;
            const imagePath = p.name.startsWith("Porterhouse")
                ? "assets/images/porterhouse.png"
                : ({
                "Hungarian Cheese": "assets/images/cheese.png",
                "Saikoro Wagyu": "assets/images/saikoro.png",
                "Kuchidoke": "assets/images/kuchidoke.png",
                "Tuna Belly": "assets/images/tuna-belly.png",
                "Tuna Panga": "assets/images/tuna-panga.png",
                "Salmon Fillet": "assets/images/salmon-fillet.png",
                "Salmon Belly": "assets/images/salmon-belly.png",
                "Salmon Crazycut": "assets/images/salmon-cut.png"
            }[p.name]);
            return `
            <article class="catalog-product-card">
                <div class="catalog-product-image${imagePath ? ' catalog-product-image--photo' : ''}${p.name === "Hungarian Cheese" ? ' catalog-product-image--hungarian-cheese' : ''}${p.name === "Salmon Crazycut" ? ' catalog-product-image--salmon-crazycut' : ''}${p.name === "Saikoro Wagyu" ? ' catalog-product-image--saikoro' : ''}${p.name === "Kuchidoke" ? ' catalog-product-image--kuchidoke' : ''}${p.name.startsWith("Porterhouse") ? ' catalog-product-image--porterhouse' : ''}${p.name === "Tuna Belly" ? ' catalog-product-image--tuna-belly' : ''}${p.name === "Tuna Panga" ? ' catalog-product-image--tuna-panga' : ''}${p.name === "Salmon Belly" ? ' catalog-product-image--salmon-belly' : ''}" aria-hidden="true">
                    ${imagePath ? `<img src="${imagePath}" alt="" loading="lazy">` : ''}
                </div>
                <div class="catalog-product-info">
                    <div class="catalog-product-copy">
                        <h3>${escapeHtml(p.name)}</h3>
                        <p>₱${priceForOrderType(p, orderType, cartQuantity).toLocaleString()}${p.unit === '1 kg' ? ' / kg' : ''}</p>
                    </div>
                    <button type="button" onclick="addToCart(${p.id})" aria-label="Add ${escapeHtml(p.name)} to cart" title="Add to cart" class="catalog-add-button">
                        <i class="fa-solid fa-cart-shopping" aria-hidden="true"></i>
                    </button>
                </div>
            </article>
        `;
        }).join('');

        grid.insertAdjacentHTML('beforeend', `
            <section class="catalog-category-section" aria-labelledby="category-${escapeHtml(category)}">
                <h3 id="category-${escapeHtml(category)}" class="catalog-category-heading">${escapeHtml(categoryLabels[category] || category)}</h3>
                <div class="catalog-category-products">${cards}</div>
            </section>
        `);
    });
}

export function filterCategory(cat) {
    currentFilter = cat;
    const searchVal = document.getElementById('search-input')?.value || '';
    renderProducts(cat, searchVal);
}

export function searchProducts() {
    const query = document.getElementById('search-input')?.value || '';
    renderProducts(currentFilter, query);
}

export function addToCart(id) {
    const product = products.find(p => p.id === id);
    const existing = cart.find(item => item.id === id);
    if (existing) existing.qty += 1;
    else cart.push({ ...product, qty: 1 });
    updateCartUI();
    renderProducts(currentFilter, document.getElementById('search-input')?.value || '');
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
        const product = products.find(candidate => candidate.id === item.id) || item;
        const orderType = document.getElementById('order-type')?.value || 'Retail';
        const price = priceForOrderType(product, orderType, item.qty);
        total += price * item.qty;
        const automaticWholesale = orderType !== 'Wholesale'
            && automaticWholesaleProducts.has(product.name)
            && item.qty >= 10;
        container.innerHTML += `
            <div class="flex items-center justify-between bg-slate-800 p-4 rounded-xl border border-slate-700">
                <div>
                    <h4 class="font-bold text-sm text-white">${escapeHtml(item.name)}</h4>
                    <span class="text-xs text-slate-400">₱${price.toLocaleString()} / ${escapeHtml(item.unit)}</span>
                    ${automaticWholesale ? '<span class="block text-xs text-emerald-700">Wholesale price applied (10 kg+)</span>' : ''}
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
    renderProducts(currentFilter, document.getElementById('search-input')?.value || '');
}

export function removeItem(index) {
    cart.splice(index, 1);
    updateCartUI();
    renderProducts(currentFilter, document.getElementById('search-input')?.value || '');
}

export function openCart() { document.getElementById('cart-drawer')?.classList.remove('hidden'); }
export function closeCart() { document.getElementById('cart-drawer')?.classList.add('hidden'); }

export function sendViaWhatsApp() {
    if (cart.length === 0) { alert(storefrontCopy.emptyCartAlert); return; }
    const name = document.getElementById('order-name')?.value.trim() || 'Valued Customer';
    const phone = document.getElementById('order-phone')?.value.trim() || 'N/A';
    const orderType = document.getElementById('order-type')?.value || 'Retail';
    const paymentMethod = document.getElementById('payment-method')?.value || 'Cash';

    let msg = `*${storefrontCopy.whatsappOrderTitle}*\n`;
    msg += `*${storefrontCopy.whatsappNameLabel}:* ${name}\n`;
    msg += `*${storefrontCopy.whatsappContactLabel}:* ${phone}\n`;
    msg += `*${storefrontCopy.whatsappTypeLabel}:* ${orderType}\n`;
    msg += `*Mode of Payment:* ${paymentMethod}\n\n*${storefrontCopy.whatsappItemsLabel}:*\n`;
    
    cart.forEach(i => {
        const product = products.find(candidate => candidate.id === i.id) || i;
        msg += `- ${i.name} (${i.qty}x ${i.unit}) @ ₱${priceForOrderType(product, orderType, i.qty)} / ${i.unit}\n`;
    });

    const total = cart.reduce((sum, item) => {
        const product = products.find(candidate => candidate.id === item.id) || item;
        return sum + priceForOrderType(product, orderType, item.qty) * item.qty;
    }, 0);
    msg += `\n*${storefrontCopy.whatsappTotalLabel}:* ₱${total.toLocaleString()}`;

    const query = new URLSearchParams({ text: msg });
    window.open(`https://wa.me/${encodeURIComponent(storefrontCopy.whatsAppNumber)}?${query}`, '_blank');
}

window.addToCart = addToCart;
window.filterCategory = filterCategory;
window.searchProducts = searchProducts;
window.changeQty = changeQty;
window.removeItem = removeItem;
window.openCart = openCart;
window.closeCart = closeCart;
window.sendViaWhatsApp = sendViaWhatsApp;

document.getElementById('order-type')?.addEventListener('change', () => {
    renderProducts(currentFilter, document.getElementById('search-input')?.value || '');
    updateCartUI();
});