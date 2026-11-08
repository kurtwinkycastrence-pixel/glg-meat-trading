import { defaultSiteContent } from "../js/site-content.js";

const categories = new Set(["beef", "wagyu", "sausages", "imported-steaks", "local-steaks", "seafood"]);
const orderTypes = new Set(["Retail", "Wholesale", "Bulk Ton Order"]);
const contentKeys = Object.keys(defaultSiteContent).filter(key => key !== "products");

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateProducts(products) {
    if (!Array.isArray(products) || products.length === 0 || products.length > 200) {
        throw new Error("Add between 1 and 200 products.");
    }

    const ids = new Set();
    return products.map((product, index) => {
        if (!isPlainObject(product)
            || !Number.isInteger(product.id)
            || product.id < 1
            || ids.has(product.id)
            || !categories.has(product.category)
            || typeof product.name !== "string"
            || !product.name.trim()
            || product.name.length > 180
            || typeof product.desc !== "string"
            || product.desc.length > 2000
            || typeof product.unit !== "string"
            || !product.unit.trim()
            || product.unit.length > 100
            || typeof product.image !== "string"
            || !product.image.trim()
            || product.image.length > 32
            || typeof product.price !== "number"
            || !Number.isFinite(product.price)
            || product.price < 0
            || product.price > 9999999999
            || (product.stockQuantity !== undefined
                && product.stockQuantity !== null
                && (typeof product.stockQuantity !== "number"
                    || !Number.isFinite(product.stockQuantity)
                    || product.stockQuantity < 0
                    || product.stockQuantity > 999999999))) {
            throw new Error(`Product ${index + 1} has invalid fields, category, ID, or price.`);
        }

        ids.add(product.id);
        return {
            id: product.id,
            name: product.name.trim(),
            category: product.category,
            price: product.price,
            unit: product.unit.trim(),
            image: product.image.trim(),
            desc: product.desc.trim(),
            stockQuantity: product.stockQuantity ?? null
        };
    });
}

export function validateSiteContent(input) {
    if (!isPlainObject(input)) {
        throw new Error("Storefront content must be an object.");
    }

    const content = {};
    for (const key of contentKeys) {
        const value = input[key];
        if (typeof value !== "string" || value.length > 4000) {
            throw new Error(`Storefront field "${key}" must be text under 4000 characters.`);
        }
        content[key] = value.trim();
    }

    if (!/^\d{8,15}$/.test(content.whatsAppNumber)) {
        throw new Error("WhatsApp number must contain 8 to 15 digits, including the country code.");
    }

    return {
        content,
        products: validateProducts(input.products)
    };
}

export function validateOrder(input) {
    if (!isPlainObject(input)
        || typeof input.customerName !== "string"
        || !input.customerName.trim()
        || input.customerName.trim().length > 180
        || typeof input.customerPhone !== "string"
        || !input.customerPhone.trim()
        || input.customerPhone.trim().length > 80
        || !orderTypes.has(input.orderType)
        || !Array.isArray(input.items)
        || input.items.length === 0
        || input.items.length > 50) {
        throw new Error("Enter your name, contact number, order type, and at least one valid item.");
    }

    const items = input.items.map(item => {
        if (!isPlainObject(item)
            || !Number.isInteger(item.id)
            || item.id < 1
            || !Number.isInteger(item.quantity)
            || item.quantity < 1
            || item.quantity > 999) {
            throw new Error("Order items must include a valid product ID and quantity.");
        }
        return { id: item.id, quantity: item.quantity };
    });

    return {
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone.trim(),
        orderType: input.orderType,
        items
    };
}

export function validateInquiry(input) {
    if (!isPlainObject(input)
        || typeof input.customerName !== "string"
        || !input.customerName.trim()
        || input.customerName.trim().length > 180
        || typeof input.customerPhone !== "string"
        || !input.customerPhone.trim()
        || input.customerPhone.trim().length > 80
        || typeof input.message !== "string"
        || !input.message.trim()
        || input.message.trim().length > 2000) {
        throw new Error("Enter your name, contact number, and a message under 2000 characters.");
    }

    return {
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone.trim(),
        message: input.message.trim()
    };
}
