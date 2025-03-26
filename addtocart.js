// Function to check if user is logged in
function isUserLoggedIn() {
    return localStorage.getItem("token") !== null; 
}

// Function to fetch and update the cart from the backend
async function fetchCart() {
    if (!isUserLoggedIn()) return;

    let token = localStorage.getItem("token");
    try {
        let response = await fetch("http://localhost:5000/cart", {
            method: "GET",
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (response.ok) {
            let cartData = await response.json();
            localStorage.setItem("cart", JSON.stringify(cartData)); // Sync localStorage with backend
        }
    } catch (error) {
        console.error("Error fetching cart:", error);
    }
}

// Function to add an item to the cart
async function addToCart(medicineName, medicineImage, medicinePrice) {
    if (!isUserLoggedIn()) {
        alert("Please log in to add items to the cart.");
        return;
    }

    let token = localStorage.getItem("token");
    let cartData = { name: medicineName, image: medicineImage, price: parseFloat(medicinePrice), quantity: 1 };

    try {
        let response = await fetch("http://localhost:5000/cart/add", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(cartData)
        });

        if (response.ok) {
            alert(`${medicineName} added to cart!`);
            fetchCart(); // Refresh cart data from backend
        } else {
            let errorData = await response.json();
            alert(`Error: ${errorData.message}`);
        }
    } catch (error) {
        console.error("Error:", error);
        alert("Failed to add item to cart. Please try again.");
    }
}

// Attach event listener to dynamically created "Add to Cart" buttons
document.addEventListener("click", function (event) {
    if (event.target.classList.contains("add-to-cart")) {
        let medicineCard = event.target.closest(".medicine-card");
        let medicineName = medicineCard.querySelector("p").innerText;
        let medicineImage = medicineCard.querySelector("img").src;
        let medicinePrice = medicineCard.querySelector("strong").nextSibling.nodeValue.trim().replace("$", "");

        addToCart(medicineName, medicineImage, medicinePrice);
    }
});

// Fetch cart on page load
document.addEventListener("DOMContentLoaded", fetchCart);
