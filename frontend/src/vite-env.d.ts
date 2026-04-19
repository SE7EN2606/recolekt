/// <reference types="vite/client" />

// Allow CSS side-effect imports (e.g. leaflet/dist/leaflet.css)
declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}