import { describe, expect, it, vi } from "vitest";
import { getWebflowBridge } from "../extension/src/webflow/bridge.js";

describe("Webflow bridge image insertion", () => {
  it("imports repo tokens as Webflow variables and reuses existing matches", async () => {
    const variables: Array<{
      id: string;
      name: string;
      type: string;
      value: string;
      getName: () => Promise<string>;
      get: () => Promise<string>;
    }> = [
      {
        id: "var-existing",
        name: "Colors/green/primary",
        type: "color",
        value: "#8EC441",
        getName: async () => "Colors/green/primary",
        get: async () => "#8EC441"
      }
    ];
    const collection = {
      getAllVariables: vi.fn(async () => variables),
      getVariableByName: vi.fn(async (name: string) =>
        variables.find((variable) => variable.name === name) ?? null
      ),
      createColorVariable: vi.fn(async (name: string, value: string) => {
        const variable = {
          id: `var-${variables.length + 1}`,
          name,
          type: "color",
          value,
          getName: async () => name,
          get: async () => value
        };
        variables.push(variable);
        return variable;
      })
    };

    Object.defineProperty(globalThis, "window", {
      value: {
        webflow: {
          elementPresets: { DOM: {}, Image: {} },
          getSiteInfo: async () => ({ siteId: "site-1", name: "Test Site" }),
          getCurrentPage: async () => ({ id: "page-1", getName: async () => "Home" }),
          getCurrentMode: async () => "design",
          getSelectedElement: async () => null,
          getAllStyles: async () => [],
          getStyleByName: async () => null,
          createStyle: async () => ({
            id: "style-1",
            getName: async () => "style-1",
            setProperties: async () => undefined
          }),
          removeStyle: async () => undefined,
          getDefaultVariableCollection: async () => collection,
          getAllAssets: async () => []
        }
      },
      configurable: true
    });

    const bridge = getWebflowBridge();
    const result = await bridge.importVariables!([
      {
        group: "Colors",
        name: "green/primary",
        type: "color",
        value: "#8EC441",
        sourceFile: "tokens/colors.tokens.json"
      },
      {
        group: "Colors",
        name: "navy/dark",
        type: "color",
        value: "#001235",
        sourceFile: "tokens/colors.tokens.json"
      }
    ]);

    expect(result.reused.map((token) => token.name)).toEqual(["green/primary"]);
    expect(result.created.map((token) => token.name)).toEqual(["navy/dark"]);
    expect(result.missingAfterImport).toEqual([]);
    expect(collection.createColorVariable).toHaveBeenCalledWith("Colors/navy/dark", "#001235");
  });

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

  it("uses the TextBlock preset for tagline-like div nodes with text content", async () => {
    const textBlockPreset = {};
    const append = vi.fn(async (preset) => {
      expect(preset).toBe(textBlockPreset);
      return created;
    });
    const setTag = vi.fn(async () => undefined);

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
      id: "created-text",
      type: "DOM",
      append: vi.fn(),
      after: vi.fn(),
      setTag,
      setTextContent: vi.fn(async () => undefined),
      setAttribute: vi.fn(),
      setAltText: vi.fn()
    };

    Object.defineProperty(globalThis, "window", {
      value: {
        webflow: {
          elementPresets: {
            DOM: {},
            DivBlock: {},
            TextBlock: textBlockPreset,
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
        id: "tagline-1",
        type: "box",
        tag: "div",
        textContent: "FOUNDED IN 1995",
        classNames: ["text-style-tagline"],
        children: []
      }
    });

    expect(setTag).not.toHaveBeenCalled();
  });

  it("uses the TextBlock preset for stat-like value div nodes with text content", async () => {
    const textBlockPreset = {};
    const append = vi.fn(async (preset) => {
      expect(preset).toBe(textBlockPreset);
      return created;
    });
    const setTag = vi.fn(async () => undefined);

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
      id: "created-stat",
      type: "DOM",
      append: vi.fn(),
      after: vi.fn(),
      setTag,
      setTextContent: vi.fn(async () => undefined),
      setAttribute: vi.fn(),
      setAltText: vi.fn()
    };

    Object.defineProperty(globalThis, "window", {
      value: {
        webflow: {
          elementPresets: {
            DOM: {},
            DivBlock: {},
            TextBlock: textBlockPreset,
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
        id: "stat-1",
        type: "box",
        tag: "div",
        textContent: "50+",
        classNames: ["authority_item_value"],
        children: []
      }
    });

    expect(setTag).not.toHaveBeenCalled();
  });

  it("uses the TextBlock preset for generic inner textblock div nodes without classes", async () => {
    const textBlockPreset = {};
    const append = vi.fn(async (preset) => {
      expect(preset).toBe(textBlockPreset);
      return created;
    });
    const setTag = vi.fn(async () => undefined);

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
      id: "created-tag-text",
      type: "DOM",
      append: vi.fn(),
      after: vi.fn(),
      setTag,
      setTextContent: vi.fn(async () => undefined),
      setAttribute: vi.fn(),
      setAltText: vi.fn()
    };

    Object.defineProperty(globalThis, "window", {
      value: {
        webflow: {
          elementPresets: {
            DOM: {},
            DivBlock: {},
            TextBlock: textBlockPreset,
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
        id: "tag-text-1",
        type: "text",
        tag: "div",
        textContent: "Medicare Fraud and Kickbacks",
        classNames: [],
        children: []
      }
    });

    expect(setTag).not.toHaveBeenCalled();
  });

  it("creates list containers through the DOM preset and retags them to avoid seeded default items", async () => {
    const domPreset = {};
    const append = vi.fn(async (preset) => {
      expect(preset).toBe(domPreset);
      return created;
    });
    const setTag = vi.fn(async () => undefined);

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
      id: "created-list",
      type: "DOM",
      append: vi.fn(),
      after: vi.fn(),
      setTag,
      setTextContent: vi.fn(async () => undefined),
      setAttribute: vi.fn(),
      setAltText: vi.fn()
    };

    Object.defineProperty(globalThis, "window", {
      value: {
        webflow: {
          elementPresets: {
            DOM: domPreset,
            DivBlock: {},
            TextBlock: {},
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
        id: "list-1",
        type: "list",
        tag: "ul",
        classNames: ["lawyers_list"],
        children: []
      }
    });

    expect(setTag).toHaveBeenCalledWith("ul");
  });

  it("creates blockquote nodes through the native preset instead of a custom DOM retag", async () => {
    const blockquotePreset = {};
    const append = vi.fn(async (preset) => {
      expect(preset).toBe(blockquotePreset);
      return created;
    });
    const setTag = vi.fn(async () => undefined);

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
      id: "created-blockquote",
      type: "Blockquote",
      append: vi.fn(),
      after: vi.fn(),
      setTag,
      setTextContent: vi.fn(async () => undefined),
      setAttribute: vi.fn(),
      setAltText: vi.fn()
    };

    Object.defineProperty(globalThis, "window", {
      value: {
        webflow: {
          elementPresets: {
            DOM: {},
            DivBlock: {},
            Blockquote: blockquotePreset,
            TextBlock: {},
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
        id: "quote-1",
        type: "text",
        tag: "blockquote",
        classNames: ["blockquote", "text-style-italic"],
        textContent: "Quoted disclaimer copy",
        children: []
      }
    });

    expect(setTag).not.toHaveBeenCalled();
  });

  it("prefers the live selected handle when writing TextBlock content", async () => {
    const textBlockPreset = {};
    const staleSetTextContent = vi.fn(async () => undefined);
    const liveSetTextContent = vi.fn(async () => undefined);
    const append = vi.fn(async () => created);
    const setTag = vi.fn(async () => undefined);

    const created = {
      id: "created-text",
      type: "DOM",
      append: vi.fn(),
      after: vi.fn(),
      setTag,
      setTextContent: staleSetTextContent,
      setAttribute: vi.fn(),
      setAltText: vi.fn()
    };

    const selected = {
      id: "created-text",
      type: "DOM",
      children: true,
      append,
      after: vi.fn(),
      setTag: vi.fn(),
      setTextContent: liveSetTextContent,
      setAttribute: vi.fn(),
      setAltText: vi.fn()
    };

    Object.defineProperty(globalThis, "window", {
      value: {
        webflow: {
          elementPresets: {
            DOM: {},
            DivBlock: {},
            TextBlock: textBlockPreset,
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
    const { id } = await bridge.createNode({
      parentId: null,
      node: {
        id: "tagline-1",
        type: "box",
        tag: "div",
        textContent: "FOUNDED IN 1995",
        classNames: ["text-style-tagline"],
        children: []
      }
    });

    await bridge.setNodeTextContent(id, "FOUNDED IN 1995");

    expect(liveSetTextContent).toHaveBeenCalledWith("FOUNDED IN 1995");
    expect(liveSetTextContent.mock.calls.length).toBeGreaterThan(0);
    expect(staleSetTextContent).not.toHaveBeenCalled();
    expect(setTag).not.toHaveBeenCalled();
  });
});
