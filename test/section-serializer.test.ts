import { describe, expect, it } from "vitest";
import { serializeSectionContext } from "../src/backend/planner/section-serializer.js";
import type { SectionContext } from "../src/shared/contracts.js";

const CASE_STUDIES_HTML = `<section id="case-studies" class="content-stretch flex flex-col items-center py-[80px] md:py-[120px] relative shrink-0 w-full" style="background-color: rgb(250, 250, 250);"><div class="content-stretch flex flex-col gap-[48px] md:gap-[64px] items-start relative shrink-0 w-full max-w-[1200px] px-5 md:px-8 lg:px-12"><div class="content-stretch flex flex-col gap-[16px] items-start relative shrink-0 w-full" style="opacity: 0; transform: translateY(30px);"><h2 class="font-['Manrope:Light',sans-serif] font-light leading-[1.2] text-[#151515] text-[32px] md:text-[40px] lg:text-[48px] w-full">Recent Client Success Stories</h2></div><div class="grid grid-cols-1 md:grid-cols-3 gap-[24px] md:gap-[32px] w-full"><div style="opacity: 1; transform: none;"><div class="bg-white flex flex-col overflow-hidden rounded-[28px] group cursor-pointer"><div class="h-[240px] overflow-hidden relative bg-gray-100"><img src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?crop=entropy" alt="Regional Medical Practice" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"></div><div class="p-[24px] md:p-[32px] flex flex-col gap-[12px]"><div class="flex items-center gap-[8px]"><div class="content-stretch flex items-center px-[10px] py-[4px] relative rounded-[500px] shrink-0 bg-[#FFAA1D]/10"><p class="font-['Manrope:Medium',sans-serif] font-medium leading-[1.4] relative shrink-0 text-[#9B3139] text-[11px] tracking-[0.5px] uppercase">Healthcare</p></div></div><h3 class="font-['Manrope:Medium',sans-serif] font-medium text-[#151515] text-[20px] md:text-[22px] leading-[1.3]">Regional Medical Practice</h3><p class="font-['Manrope:Light',sans-serif] font-light text-[#777] text-[15px] leading-[1.6]">300% increase in online appointment bookings within 6 months</p></div></div></div><div style="opacity: 1; transform: none;"><div class="bg-white flex flex-col overflow-hidden rounded-[28px] group cursor-pointer"><div class="h-[240px] overflow-hidden relative bg-gray-100"><img src="https://images.unsplash.com/photo-1553877522-43269d4ea984?crop=entropy" alt="Community Foundation" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"></div><div class="p-[24px] md:p-[32px] flex flex-col gap-[12px]"><div class="flex items-center gap-[8px]"><div class="content-stretch flex items-center px-[10px] py-[4px] relative rounded-[500px] shrink-0 bg-[#FFAA1D]/10"><p class="font-['Manrope:Medium',sans-serif] font-medium leading-[1.4] relative shrink-0 text-[#9B3139] text-[11px] tracking-[0.5px] uppercase">Nonprofit</p></div></div><h3 class="font-['Manrope:Medium',sans-serif] font-medium text-[#151515] text-[20px] md:text-[22px] leading-[1.3]">Community Foundation</h3><p class="font-['Manrope:Light',sans-serif] font-light text-[#777] text-[15px] leading-[1.6]">Streamlined donation process increased contributions by 85%</p></div></div></div><div style="opacity: 1; transform: none;"><div class="bg-white flex flex-col overflow-hidden rounded-[28px] group cursor-pointer"><div class="h-[240px] overflow-hidden relative bg-gray-100"><img src="https://images.unsplash.com/photo-1556761175-b413da4baf72?crop=entropy" alt="Legal Association" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"></div><div class="p-[24px] md:p-[32px] flex flex-col gap-[12px]"><div class="flex items-center gap-[8px]"><div class="content-stretch flex items-center px-[10px] py-[4px] relative rounded-[500px] shrink-0 bg-[#FFAA1D]/10"><p class="font-['Manrope:Medium',sans-serif] font-medium leading-[1.4] relative shrink-0 text-[#9B3139] text-[11px] tracking-[0.5px] uppercase">Professional Services</p></div></div><h3 class="font-['Manrope:Medium',sans-serif] font-medium text-[#151515] text-[20px] md:text-[22px] leading-[1.3]">Legal Association</h3><p class="font-['Manrope:Light',sans-serif] font-light text-[#777] text-[15px] leading-[1.6]">Custom member portal reduced admin time by 60%</p></div></div></div></div></div></section>`;
const AUTHORITY_HTML = `<section id="authority" class="authority-variant authority-variant--midnight content-stretch flex flex-col items-center relative shrink-0 w-full"><div class="content-stretch flex flex-col relative shrink-0 w-full max-w-[1200px]"><div class="authority-variant-header content-stretch flex flex-col items-center relative shrink-0 w-full text-center"><p class="authority-lab-eyebrow">FOUNDED IN 1995</p><h2 class="w-full max-w-[800px]">30 Years of Innovation.<br>Built for What's Next.</h2><p class="max-w-[700px]">Since 1995, we’ve helped businesses navigate every major shift in web technology — from the early web to mobile-first design to AI-powered optimization.</p></div><div class="midnight-shell"><div class="midnight-orbit"><span class="midnight-orbit__ripple midnight-orbit__ripple--1" aria-hidden="true"></span><span class="midnight-orbit__ripple midnight-orbit__ripple--2" aria-hidden="true"></span><span class="midnight-orbit__ripple midnight-orbit__ripple--3" aria-hidden="true"></span><div class="midnight-orbit__core"><span>30</span><p>Years of innovation</p></div></div><div class="midnight-grid"><article class="midnight-card"><div class="midnight-card__header"><span class="authority-mini-label">Milestone</span><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" class="lucide lucide-calendar-range"><rect width="18" height="18" x="3" y="4" rx="2"></rect></svg></div><p class="midnight-card__value">1995</p><p class="midnight-card__label">Founded</p><p class="midnight-card__detail">Built in Albuquerque at the first big wave of the web.</p></article><article class="midnight-card"><div class="midnight-card__header"><span class="authority-mini-label">Milestone</span><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" class="lucide lucide-briefcase-business"><rect width="20" height="14" x="2" y="6" rx="2"></rect></svg></div><p class="midnight-card__value">500+</p><p class="midnight-card__label">Projects Delivered</p><p class="midnight-card__detail">Launches, rebuilds, migrations, apps, and growth-focused iterations.</p></article></div></div></div></section>`;
const EXPERIENCE_STATS_HTML = `<section class="bg-secondary py-20"><div class="max-w-7xl mx-auto px-6 lg:px-8"><div class="text-center mb-12"><h2 class="text-3xl mb-4 text-foreground">Experience You Can Trust</h2><p class="text-muted-foreground max-w-2xl mx-auto">With more than 50 years of combined experience in federal criminal defense, we bring deep knowledge of federal investigations, trial practice, sentencing, and appeals to every case.</p></div><div class="grid grid-cols-1 md:grid-cols-3 gap-8"><div class="bg-white p-8 rounded"><div class="text-4xl mb-4 text-primary" style="font-family: var(--font-serif);">50+</div><h3 class="text-lg mb-2">Years Combined Experience</h3><p class="text-sm text-muted-foreground leading-relaxed">More than five decades focused on the niche area of federal criminal defense in California federal courts and the Ninth Circuit.</p></div><div class="bg-white p-8 rounded"><div class="text-4xl mb-4 text-primary" style="font-family: var(--font-serif);">1:1</div><h3 class="text-lg mb-2">Direct Attorney Attention</h3><p class="text-sm text-muted-foreground leading-relaxed">We do not farm out work to associates. Clients work directly with us, receive personalized attention, and can reach us when urgent issues arise.</p></div><div class="bg-white p-8 rounded"><div class="text-4xl mb-4 text-primary" style="font-family: var(--font-serif);">360°</div><h3 class="text-lg mb-2">Full-Scope Representation</h3><p class="text-sm text-muted-foreground leading-relaxed">We handle matters from pre-indictment investigation through trial, sentencing, and appeal, with strategy built for every stage of the case.</p></div></div></div></section>`;

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

  it("uses placeholder content when includeContent is disabled", () => {
    const serialized = serializeSectionContext(htmlContext(CASE_STUDIES_HTML), {
      includeContent: false
    });
    const values = serialized.content.map((item) => item.value);

    expect(serialized.summary).toContain("use placeholder copy");
    expect(serialized.sourceExcerpt).toContain("section#case-studies");
    expect(serialized.sourceExcerpt).toContain("[repeats x3]");
    expect(serialized.sourceExcerpt).not.toContain("Regional Medical Practice");
    expect(values).toContain("Heading");
    expect(values).toContain("Body copy");
    expect(values).toContain("Image");
  });

  it("preserves authority heading/body separation and icon placeholders from html", () => {
    const serialized = serializeSectionContext(htmlContext(AUTHORITY_HTML));
    const values = serialized.content.map((item) => item.value);

    expect(serialized.sourceExcerpt).toContain('h2 "30 Years of Innovation. Built for What\'s Next."');
    expect(serialized.sourceExcerpt).toContain('p "Since 1995, we’ve helped businesses navigate every major shift in web technology');
    expect(serialized.sourceExcerpt).toContain("img.icon-embed-xsmall");
    expect(values).toContain("30 Years of Innovation. Built for What's Next.");
    expect(values).toContain("Since 1995, we’ve helped businesses navigate every major shift in web technology — from the early web to mobile-first design to AI-powered optimization.");
    expect(values).toContain("500+");
  });

  it("preserves long intro copy and symbolic stat values from repeated stat cards", () => {
    const serialized = serializeSectionContext(htmlContext(EXPERIENCE_STATS_HTML));
    const values = serialized.content.map((item) => item.value);

    expect(values).toContain("Experience You Can Trust");
    expect(values).toContain("With more than 50 years of combined experience in federal criminal defense, we bring deep knowledge of federal investigations, trial practice, sentencing, and appeals to every case.");
    expect(values).toContain("50+");
    expect(values).toContain("1:1");
    expect(values).toContain("360°");
    expect(values).toContain("Direct Attorney Attention");
    expect(values).toContain("Full-Scope Representation");
    expect(serialized.sourceExcerpt).toContain('p "With more than 50 years of combined experience in federal criminal defense');
  });
});
