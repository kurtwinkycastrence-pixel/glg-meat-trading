import test from "node:test";
import assert from "node:assert/strict";
import { defaultSiteContent } from "../js/site-content.js";
import {
    validateInquiry,
    validateOrder,
    validateProducts,
    validateSiteContent
} from "./validation.js";

test("validates and normalizes storefront products", () => {
    const [product] = validateProducts([defaultSiteContent.products[0]]);
    assert.equal(product.name, "Saikoro Wagyu");
    assert.equal(product.category, "wagyu");
    assert.equal(product.desc, defaultSiteContent.products[0].desc);
    assert.equal(product.stockQuantity, null);
    assert.equal(validateProducts([{ ...defaultSiteContent.products[0], stockQuantity: 12.5 }])[0].stockQuantity, 12.5);
    assert.equal(validateProducts([defaultSiteContent.products[2]])[0].wholesalePrice, 300);
    assert.throws(() => validateProducts([{
        ...defaultSiteContent.products[2],
        wholesalePrice: -1
    }]), /price/);
});

test("includes the updated catalog with separate cut-count options and sausage pricing", () => {
    const products = defaultSiteContent.products;
    assert.equal(products.length, 35);
    assert.ok(products.filter(product => !["Hungarian Cheese", "Hungarian Spicy"].includes(product.name))
        .every(product => product.price === 0));
    assert.deepEqual(
        products.filter(product => ["Hungarian Cheese", "Hungarian Spicy"].includes(product.name))
            .map(product => [product.price, product.wholesalePrice, product.unit]),
        [[350, 300, "1 kg"], [350, 300, "1 kg"]]
    );
    assert.deepEqual(
        products.filter(product => product.name.startsWith("Mondelli Ribeye")).map(product => product.unit),
        ["2 cuts", "3 cuts", "4 cuts", "5 cuts"]
    );
    assert.deepEqual(
        products.filter(product => product.name.startsWith("Meltique Ribeye")).map(product => product.unit),
        ["2 cuts", "3 cuts", "4 cuts"]
    );
    assert.deepEqual(
        products.filter(product => product.name.startsWith("T-Bone")).map(product => product.unit),
        ["2 cuts", "3 cuts", "4 cuts", "5 cuts"]
    );
    assert.deepEqual(
        products.filter(product => product.name.startsWith("Porterhouse")).map(product => product.unit),
        ["2 cuts", "3 cuts", "4 cuts", "5 cuts"]
    );
});

test("uses the supplied WhatsApp number in international format", () => {
    assert.equal(defaultSiteContent.whatsAppNumber, "63931331813");
    assert.match(defaultSiteContent.phoneValue, /\+63 931331813/);
    assert.doesNotThrow(() => validateSiteContent(defaultSiteContent));
});

test("rejects categories outside the updated product groups", () => {
    assert.throws(() => validateProducts([
        { ...defaultSiteContent.products[0], category: "other" }
    ]), /invalid fields/);
});

test("rejects invalid stock quantities", () => {
    assert.throws(() => validateProducts([
        { ...defaultSiteContent.products[0], stockQuantity: -1 }
    ]), /invalid fields/);
});

test("rejects duplicated product IDs", () => {
    assert.throws(() => validateProducts([
        defaultSiteContent.products[0],
        defaultSiteContent.products[0]
    ]), /invalid fields/);
});

test("validates required storefront copy and WhatsApp number", () => {
    const result = validateSiteContent(defaultSiteContent);
    assert.equal(result.content.brandName, defaultSiteContent.brandName);
    assert.equal(result.products.length, defaultSiteContent.products.length);
    assert.throws(() => validateSiteContent({
        ...defaultSiteContent,
        whatsAppNumber: "not-a-phone"
    }), /WhatsApp number/);
});

test("normalizes valid orders and rejects invalid quantities", () => {
    const order = validateOrder({
        customerName: "  Customer  ",
        customerPhone: " 09123456789 ",
        orderType: "Retail",
        paymentMethod: "GCash",
        items: [{ id: 1, quantity: 2 }]
    });
    assert.equal(order.customerName, "Customer");
    assert.equal(order.paymentMethod, "GCash");
    assert.deepEqual(order.items, [{ id: 1, quantity: 2 }]);
    assert.throws(() => validateOrder({
        customerName: "Customer",
        customerPhone: "09123456789",
        orderType: "Retail",
        items: [{ id: 1, quantity: 0 }]
    }), /valid product ID and quantity/);
    assert.throws(() => validateOrder({
        customerName: "Customer",
        customerPhone: "09123456789",
        orderType: "Retail",
        paymentMethod: "Crypto",
        items: [{ id: 1, quantity: 1 }]
    }), /valid item/);
});

test("requires contact details and a non-empty inquiry message", () => {
    assert.deepEqual(validateInquiry({
        customerName: " Customer ",
        customerPhone: " 09123456789 ",
        message: " Ribeye availability? "
    }), {
        customerName: "Customer",
        customerPhone: "09123456789",
        message: "Ribeye availability?"
    });
    assert.throws(() => validateInquiry({
        customerName: "Customer",
        customerPhone: "09123456789",
        message: " "
    }), /message/);
});
