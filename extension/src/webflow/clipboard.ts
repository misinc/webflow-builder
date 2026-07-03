/**
 * Write a Webflow paste payload (@webflow/XscpData JSON) to the clipboard.
 * The Designer reads the `application/json` clipboard flavor, which can only
 * be set from a real copy event — navigator.clipboard cannot. Must be called
 * from a user gesture (click); throws if the browser blocks the write.
 */
export function copyWebflowPayloadToClipboard(json: string): void {
  const onCopy = (event: ClipboardEvent) => {
    event.preventDefault();
    event.clipboardData?.setData("application/json", json);
    event.clipboardData?.setData("text/plain", json);
  };
  document.addEventListener("copy", onCopy);
  try {
    const copied = document.execCommand("copy");
    if (!copied) {
      throw new Error("The browser blocked the clipboard write. Click the button again.");
    }
  } finally {
    document.removeEventListener("copy", onCopy);
  }
}
