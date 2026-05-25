import { describe, expect, it, vi } from "vitest";
import { getWebflowBridge } from "../extension/src/webflow/bridge.js";

describe("Webflow bridge image insertion", () => {
  it("uses setAltText instead of reserved alt attributes for image nodes", async () => {
    const append = vi.fn(async () => created);
    const setAttribute = vi.fn(async () => undefined);
    const setAltText = vi.fn(async () => null);

    const selected = {
      id: "selected-root",
      type: "DOM",
      children: true,
      append,
      after: vi.fn(),
      setTag: vi.fn(),
      setTextContent: vi.fn(),
      setAttribute: vi.fn(),
      setAltText: vi.fn()
    };

    const created = {
      id: "created-image",
      type: "Image",
      append: vi.fn(),
      after: vi.fn(),
      setTag: vi.fn(),
      setTextContent: vi.fn(),
      setAttribute,
      setAltText
    };

    Object.defineProperty(globalThis, "window", {
      value: {
        webflow: {
          elementPresets: {
            DOM: {},
            Image: {}
          },
          getSiteInfo: async () => ({ siteId: "site-1", name: "Test Site" }),
          getCurrentPage: async () => ({ id: "page-1", getName: async () => "Home" }),
          getCurrentMode: async () => "design",
          getSelectedElement: async () => selected,
          getAllStyles: async () => [],
          getStyleByName: async () => null,
          createStyle: async () => ({
            id: "style-1",
            getName: async () => "style-1",
            setProperties: async () => undefined
          }),
          removeStyle: async () => undefined,
          getDefaultVariableCollection: async () => null,
          getAllAssets: async () => []
        }
      },
      configurable: true
    });

    const bridge = getWebflowBridge();
    await bridge.createNode({
      parentId: null,
      node: {
        id: "image-1",
        type: "image",
        tag: "img",
        label: "Case study image",
        classNames: ["case-studies_image"],
        children: []
      }
    });

    expect(setAltText).toHaveBeenCalledWith("Case study image");
    expect(setAttribute).not.toHaveBeenCalledWith("alt", "Case study image");
  });
});
