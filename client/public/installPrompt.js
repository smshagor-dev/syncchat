let deferredPrompt;

window.addEventListener("beforeinstallprompt", e => {
  // Prevent the mini info bar from appearing
  e.preventDefault();
  deferredPrompt = e;

  // Check if the popup was already shown before
  const shown = localStorage.getItem("pwaPromptShown");
  if (!shown) {
    showInstallPopup();
  }
});

function showInstallPopup() {
  const popup = document.createElement("div");
  popup.id = "pwa-install-popup";
  popup.innerHTML = `
    <div class="popup-content">
      <h3>Install SyncChat</h3>
      <p>Get quick access by installing it on your device.</p>
      <div class="buttons">
        <button id="install-btn">Install</button>
        <button id="close-btn">Later</button>
      </div>
    </div>
  `;

  // Basic styles
  const style = document.createElement("style");
  style.innerHTML = `
    #pwa-install-popup {
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      background: #0284c7;
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 1rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      z-index: 9999;
      max-width: 320px;
      text-align: center;
      animation: fadeIn 0.3s ease-in-out;
      font-family: system-ui, sans-serif;
    }

    .popup-content h3 {
      margin: 0 0 8px;
    }
    .popup-content p {
      font-size: 0.9rem;
      margin: 0 0 12px;
    }

    .buttons {
      display: flex;
      gap: 0.5rem;
      justify-content: center;
    }

    .buttons button {
      border: none;
      padding: 6px 12px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
    }

    #install-btn {
      background: white;
      color: #0284c7;
    }

    #close-btn {
      background: rgba(255,255,255,0.2);
      color: white;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translate(-50%, 20px); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(popup);

  document.getElementById("install-btn").addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        console.log("User installed the PWA");
      }
      deferredPrompt = null;
    }
    localStorage.setItem("pwaPromptShown", "true");
    popup.remove();
  });

  document.getElementById("close-btn").addEventListener("click", () => {
    localStorage.setItem("pwaPromptShown", "true");
    popup.remove();
  });
}
