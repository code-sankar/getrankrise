// frontend/src/utils/paddle.loader.js
let paddlePromise = null;

export const loadPaddle = () => {
  if (paddlePromise) return paddlePromise;

  paddlePromise = new Promise((resolve, reject) => {
    if (window.Paddle) return resolve(window.Paddle);

    const script = document.createElement("script");
    script.src   = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;

    script.onload = () => {
      try {
        window.Paddle.Environment.set(import.meta.env.VITE_PADDLE_ENV || "sandbox");
        window.Paddle.Initialize({
          token: import.meta.env.VITE_PADDLE_CLIENT_TOKEN,
          eventCallback: (e) => {
            if (e.name === "checkout.completed") {
              // Server will get the webhook; refresh subscription on next nav
              window.dispatchEvent(new CustomEvent("paddle:checkout-completed"));
            }
          },
        });
        resolve(window.Paddle);
      } catch (err) { reject(err); }
    };
    script.onerror = () => reject(new Error("Could not load Paddle.js"));
    document.head.appendChild(script);
  });

  return paddlePromise;
};