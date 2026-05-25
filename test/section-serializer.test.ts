import { describe, expect, it } from "vitest";
import { serializeSectionContext } from "../src/backend/planner/section-serializer.js";
import type { SectionContext } from "../src/shared/contracts.js";

const CASE_STUDIES_HTML = `<section id="case-studies" class="content-stretch flex flex-col items-center py-[80px] md:py-[120px] relative shrink-0 w-full" style="background-color: rgb(250, 250, 250);"><div class="content-stretch flex flex-col gap-[48px] md:gap-[64px] items-start relative shrink-0 w-full max-w-[1200px] px-5 md:px-8 lg:px-12"><div class="content-stretch flex flex-col gap-[16px] items-start relative shrink-0 w-full" style="opacity: 0; transform: translateY(30px);"><h2 class="font-['Manrope:Light',sans-serif] font-light leading-[1.2] text-[#151515] text-[32px] md:text-[40px] lg:text-[48px] w-full">Recent Client Success Stories</h2></div><div class="grid grid-cols-1 md:grid-cols-3 gap-[24px] md:gap-[32px] w-full"><div style="opacity: 1; transform: none;"><div class="bg-white flex flex-col overflow-hidden rounded-[28px] group cursor-pointer"><div class="h-[240px] overflow-hidden relative bg-gray-100"><img src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?crop=entropy" alt="Regional Medical Practice" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"></div><div class="p-[24px] md:p-[32px] flex flex-col gap-[12px]"><div class="flex items-center gap-[8px]"><div class="content-stretch flex items-center px-[10px] py-[4px] relative rounded-[500px] shrink-0 bg-[#FFAA1D]/10"><p class="font-['Manrope:Medium',sans-serif] font-medium leading-[1.4] relative shrink-0 text-[#9B3139] text-[11px] tracking-[0.5px] uppercase">Healthcare</p></div></div><h3 class="font-['Manrope:Medium',sans-serif] font-medium text-[#151515] text-[20px] md:text-[22px] leading-[1.3]">Regional Medical Practice</h3><p class="font-['Manrope:Light',sans-serif] font-light text-[#777] text-[15px] leading-[1.6]">300% increase in online appointment bookings within 6 months</p></div></div></div><div style="opacity: 1; transform: none;"><div class="bg-white flex flex-col overflow-hidden rounded-[28px] group cursor-pointer"><div class="h-[240px] overflow-hidden relative bg-gray-100"><img src="https://images.unsplash.com/photo-1553877522-43269d4ea984?crop=entropy" alt="Community Foundation" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"></div><div class="p-[24px] md:p-[32px] flex flex-col gap-[12px]"><div class="flex items-center gap-[8px]"><div class="content-stretch flex items-center px-[10px] py-[4px] relative rounded-[500px] shrink-0 bg-[#FFAA1D]/10"><p class="font-['Manrope:Medium',sans-serif] font-medium leading-[1.4] relative shrink-0 text-[#9B3139] text-[11px] tracking-[0.5px] uppercase">Nonprofit</p></div></div><h3 class="font-['Manrope:Medium',sans-serif] font-medium text-[#151515] text-[20px] md:text-[22px] leading-[1.3]">Community Foundation</h3><p class="font-['Manrope:Light',sans-serif] font-light text-[#777] text-[15px] leading-[1.6]">Streamlined donation process increased contributions by 85%</p></div></div></div><div style="opacity: 1; transform: none;"><div class="bg-white flex flex-col overflow-hidden rounded-[28px] group cursor-pointer"><div class="h-[240px] overflow-hidden relative bg-gray-100"><img src="https://images.unsplash.com/photo-1556761175-b413da4baf72?crop=entropy" alt="Legal Association" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"></div><div class="p-[24px] md:p-[32px] flex flex-col gap-[12px]"><div class="flex items-center gap-[8px]"><div class="content-stretch flex items-center px-[10px] py-[4px] relative rounded-[500px] shrink-0 bg-[#FFAA1D]/10"><p class="font-['Manrope:Medium',sans-serif] font-medium leading-[1.4] relative shrink-0 text-[#9B3139] text-[11px] tracking-[0.5px] uppercase">Professional Services</p></div></div><h3 class="font-['Manrope:Medium',sans-serif] font-medium text-[#151515] text-[20px] md:text-[22px] leading-[1.3]">Legal Association</h3><p class="font-['Manrope:Light',sans-serif] font-light text-[#777] text-[15px] leading-[1.6]">Custom member portal reduced admin time by 60%</p></div></div></div></div></div></section>`;

function htmlContext(sourceCode: string): SectionContext {
  return {
    repoId: "debug-playground",
    pageName: "Debug playground",
    pageSourceFile: "debug://page",
    sectionName: "Case Studies",
    sectionSourceFile: "debug://case-studies.html",
    componentName: "CaseStudies",
    sectionOrder: 0,
    sourceCode,
    relevantStylesheets: [],
    assetReferences: [],
    contentHints: [],
    relatedSharedClasses: []
  };
}

describe("serializeSectionContext", () => {
  it("builds a structural html outline that preserves repeated card groups", () => {
    const serialized = serializeSectionContext(htmlContext(CASE_STUDIES_HTML));

    expect(serialized.summary).toContain("Case Studies");
    expect(serialized.sourceExcerpt).toContain('section#case-studies');
    expect(serialized.sourceExcerpt).toContain('[repeats x3]');
    expect(serialized.sourceExcerpt).toContain('img "Regional Medical Practice"');
    expect(serialized.sourceExcerpt).toContain('h3 "Regional Medical Practice"');
  });

  it("extracts human content from html instead of utility class noise", () => {
    const serialized = serializeSectionContext(htmlContext(CASE_STUDIES_HTML));
    const values = serialized.content.map((item) => item.value);

    expect(values).toContain("Recent Client Success Stories");
    expect(values).toContain("Healthcare");
    expect(values).toContain("Regional Medical Practice");
    expect(values).toContain("300% increase in online appointment bookings within 6 months");
  });
});
