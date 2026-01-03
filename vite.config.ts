import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],

  //add host
  server: {
    host: "0.0.0.0",
    allowedHosts: ["c9ce39f53320.ngrok-free.app"],
  },
});
