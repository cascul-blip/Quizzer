// Audio files imported by client code are bundled as assets; the import is their URL.
declare module "*.mp3" {
  const url: string;
  export default url;
}
