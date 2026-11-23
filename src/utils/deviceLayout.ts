export interface UpperRightVoidSpec {
  /** Unobstructed pixel width in the upper-right void outside the 3D board */
  voidWidthPx: number;
  /** Unobstructed pixel height in the upper-right void outside the 3D board */
  voidHeightPx: number;
  /** 95% width budget for Chess Angel portrait + modal */
  targetWidthPx: number;
  /** 95% height budget for Chess Angel portrait + modal */
  targetHeightPx: number;
  /** True when meaningful upper-right void space exists around the board */
  hasVoidSpace: boolean;
}

export function isTouchTabletHardware(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent || '';
  const isIpadOrTabletUa =
    /iPad|Tablet|PlayBook|Silk/i.test(ua) ||
    (/Android/i.test(ua) && !/Mobile/i.test(ua)) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIpadOrTabletUa) return true;

  if (typeof window.matchMedia === 'function') {
    if (window.matchMedia('(pointer: coarse) and (hover: none)').matches) {
      return true;
    }
  }
  return false;
}

export function computeFallbackUpperRightVoid(w: number, h: number): UpperRightVoidSpec {
  const isPortrait = w < h;
  const estVoidW = isPortrait
    ? Math.round(w * (w < 560 ? 0.76 : 0.66))
    : Math.max(145, Math.round(w - Math.min(w * 0.64, h * 0.88)));
  const estVoidH = isPortrait
    ? Math.max(145, Math.round(h - w * 0.9 - 54))
    : Math.max(145, Math.round(Math.min(h - 12, h * 0.97) - 34));
  return {
    voidWidthPx: estVoidW,
    voidHeightPx: estVoidH,
    targetWidthPx: Math.round(estVoidW * 0.97),
    targetHeightPx: Math.round(estVoidH * 0.97),
    hasVoidSpace: estVoidW >= 132 && estVoidH >= 132,
  };
}

export interface AngelVoidTierClasses {
  index: number;
  minWidthPx: number;
  minWideWidthPx: number;
  minHeightPx: number;
  minTreeHeightPx: number;
  portraitWidthPx: number;
  compactPortraitWidthPx: number;
  asidePositionClass: string;
  asideWidthClass: string;
  asideWideWidthClass: string;
  portraitWidthClass: string;
  compactPortraitWidthClass: string;
  cardShellClass: string;
  titleTextClass: string;
  tagTextClass: string;
  bodyQuoteClass: string;
  sectionDividerClass: string;
  treeMaxHeightClass: string;
  simChipListClass: string;
  iconSmClass: string;
  iconBtnPadClass: string;
  primaryActionBtnClass: string;
  secondaryActionBtnClass: string;
  footerBtnPadClass: string;
  footerBtnCompactPadClass: string;
  footerBtnIconClass: string;
  showVerboseCopy: boolean;
}

/**
 * 14 static Tailwind size tiers from compact fallback (Tier 0) up to full native 554×740 portrait video (Tier 13).
 * Both Chess Angel's portrait video above and her black-framed modal below share the exact same column width,
 * and every tier renders 100% of the modal's content without internal height clipping or text truncation.
 */
export const ANGEL_VOID_SIZE_TIERS: ReadonlyArray<AngelVoidTierClasses> = [
  // Tier 0: Compact fallback when minimal upper-right void remains (136px unified column)
  {
    index: 0,
    minWidthPx: 0,
    minWideWidthPx: 0,
    minHeightPx: 0,
    minTreeHeightPx: 0,
    portraitWidthPx: 136,
    compactPortraitWidthPx: 128,
    asidePositionClass: 'top-3 right-1',
    asideWidthClass: 'w-[136px]',
    asideWideWidthClass: 'w-[128px]',
    portraitWidthClass: 'w-[136px]',
    compactPortraitWidthClass: 'w-[128px]',
    cardShellClass: 'rounded-md px-1.5 py-1',
    titleTextClass: 'text-[8px] leading-tight',
    tagTextClass: 'text-[7.5px] leading-tight',
    bodyQuoteClass: 'mt-0.5 text-[8px] leading-[1.2] break-words text-[#e6e1d6]',
    sectionDividerClass: 'mt-1 pt-1 border-t border-white/10',
    treeMaxHeightClass: 'rounded-md p-1.5',
    simChipListClass: 'mt-1 gap-0.5',
    iconSmClass: 'w-2.5 h-2.5',
    iconBtnPadClass: 'p-0.5',
    primaryActionBtnClass:
      'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] text-[8px] font-semibold leading-tight transition-colors cursor-pointer',
    secondaryActionBtnClass:
      'px-1 py-0.5 rounded bg-black hover:bg-[#151a24] border border-white/14 text-[8px] leading-tight text-[#cbd2df] cursor-pointer',
    footerBtnPadClass: 'px-1 py-0.5 text-[7.5px] leading-tight rounded gap-0.5',
    footerBtnCompactPadClass: 'px-1 py-0.5 text-[7.5px] leading-tight rounded gap-0.5',
    footerBtnIconClass: 'w-2 h-2',
    showVerboseCopy: true,
  },
  // Tier 1: XS (150px unified column)
  {
    index: 1,
    minWidthPx: 152,
    minWideWidthPx: 142,
    minHeightPx: 268,
    minTreeHeightPx: 292,
    portraitWidthPx: 150,
    compactPortraitWidthPx: 140,
    asidePositionClass: 'top-4 right-1.5',
    asideWidthClass: 'w-[150px]',
    asideWideWidthClass: 'w-[140px]',
    portraitWidthClass: 'w-[150px]',
    compactPortraitWidthClass: 'w-[140px]',
    cardShellClass: 'rounded-md px-2 py-1.5',
    titleTextClass: 'text-[8.5px] leading-tight',
    tagTextClass: 'text-[8px] leading-tight',
    bodyQuoteClass: 'mt-1 text-[8.5px] leading-[1.24] break-words text-[#e6e1d6]',
    sectionDividerClass: 'mt-1 pt-1 border-t border-white/10',
    treeMaxHeightClass: 'rounded-md p-1.5',
    simChipListClass: 'mt-1 gap-0.5',
    iconSmClass: 'w-2.5 h-2.5',
    iconBtnPadClass: 'p-0.5',
    primaryActionBtnClass:
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] text-[8.5px] font-semibold leading-tight transition-colors cursor-pointer',
    secondaryActionBtnClass:
      'px-1.5 py-0.5 rounded bg-black hover:bg-[#151a24] border border-white/14 text-[8.5px] leading-tight text-[#cbd2df] cursor-pointer',
    footerBtnPadClass: 'px-1.5 py-0.5 text-[8px] leading-tight rounded gap-0.5',
    footerBtnCompactPadClass: 'px-1 py-0.5 text-[8px] leading-tight rounded gap-0.5',
    footerBtnIconClass: 'w-2 h-2',
    showVerboseCopy: true,
  },
  // Tier 2: SM (168px unified column)
  {
    index: 2,
    minWidthPx: 170,
    minWideWidthPx: 156,
    minHeightPx: 298,
    minTreeHeightPx: 326,
    portraitWidthPx: 168,
    compactPortraitWidthPx: 154,
    asidePositionClass: 'top-5 right-2',
    asideWidthClass: 'w-[168px]',
    asideWideWidthClass: 'w-[154px]',
    portraitWidthClass: 'w-[168px]',
    compactPortraitWidthClass: 'w-[154px]',
    cardShellClass: 'rounded-lg px-2 py-1.5',
    titleTextClass: 'text-[9.5px] leading-tight',
    tagTextClass: 'text-[8.5px] leading-tight',
    bodyQuoteClass: 'mt-1 text-[9.5px] leading-[1.28] break-words text-[#e6e1d6]',
    sectionDividerClass: 'mt-1.5 pt-1 border-t border-white/10',
    treeMaxHeightClass: 'rounded-lg p-2',
    simChipListClass: 'mt-1 gap-0.5',
    iconSmClass: 'w-2.5 h-2.5',
    iconBtnPadClass: 'p-1',
    primaryActionBtnClass:
      'inline-flex items-center gap-1 px-2 py-1 rounded bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] text-[9px] font-semibold leading-tight transition-colors cursor-pointer',
    secondaryActionBtnClass:
      'px-1.5 py-1 rounded bg-black hover:bg-[#151a24] border border-white/14 text-[9px] leading-tight text-[#cbd2df] cursor-pointer',
    footerBtnPadClass: 'px-1.5 py-1 text-[8.5px] leading-tight rounded gap-1',
    footerBtnCompactPadClass: 'px-1.5 py-0.5 text-[8.5px] leading-tight rounded gap-1',
    footerBtnIconClass: 'w-2.5 h-2.5',
    showVerboseCopy: true,
  },
  // Tier 3: MD-SM (188px unified column)
  {
    index: 3,
    minWidthPx: 190,
    minWideWidthPx: 172,
    minHeightPx: 334,
    minTreeHeightPx: 368,
    portraitWidthPx: 188,
    compactPortraitWidthPx: 170,
    asidePositionClass: 'top-6 right-2.5',
    asideWidthClass: 'w-[188px]',
    asideWideWidthClass: 'w-[170px]',
    portraitWidthClass: 'w-[188px]',
    compactPortraitWidthClass: 'w-[170px]',
    cardShellClass: 'rounded-lg px-2.5 py-2',
    titleTextClass: 'text-[10px] leading-snug',
    tagTextClass: 'text-[9.5px] leading-snug',
    bodyQuoteClass: 'mt-1.5 text-[10px] leading-[1.32] break-words text-[#e6e1d6]',
    sectionDividerClass: 'mt-1.5 pt-1.5 border-t border-white/10',
    treeMaxHeightClass: 'rounded-lg p-2.5',
    simChipListClass: 'mt-1.5 gap-1',
    iconSmClass: 'w-3 h-3',
    iconBtnPadClass: 'p-1',
    primaryActionBtnClass:
      'inline-flex items-center gap-1 px-2 py-1 rounded bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] text-[10px] font-semibold leading-tight transition-colors cursor-pointer',
    secondaryActionBtnClass:
      'px-2 py-1 rounded bg-black hover:bg-[#151a24] border border-white/14 text-[10px] leading-tight text-[#cbd2df] cursor-pointer',
    footerBtnPadClass: 'px-2 py-1 text-[9.5px] leading-tight rounded gap-1',
    footerBtnCompactPadClass: 'px-1.5 py-1 text-[9px] leading-tight rounded gap-1',
    footerBtnIconClass: 'w-2.5 h-2.5',
    showVerboseCopy: true,
  },
  // Tier 4: MD (212px unified column)
  {
    index: 4,
    minWidthPx: 214,
    minWideWidthPx: 192,
    minHeightPx: 376,
    minTreeHeightPx: 416,
    portraitWidthPx: 212,
    compactPortraitWidthPx: 190,
    asidePositionClass: 'top-7 right-3',
    asideWidthClass: 'w-[212px]',
    asideWideWidthClass: 'w-[190px]',
    portraitWidthClass: 'w-[212px]',
    compactPortraitWidthClass: 'w-[190px]',
    cardShellClass: 'rounded-xl px-3 py-2.5',
    titleTextClass: 'text-[11px] leading-normal',
    tagTextClass: 'text-[10px] leading-snug',
    bodyQuoteClass: 'mt-1.5 text-[11px] leading-snug break-words text-[#e6e1d6]',
    sectionDividerClass: 'mt-2 pt-2 border-t border-white/10',
    treeMaxHeightClass: 'rounded-xl p-3',
    simChipListClass: 'mt-2 gap-1',
    iconSmClass: 'w-3 h-3',
    iconBtnPadClass: 'p-1',
    primaryActionBtnClass:
      'inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] text-[10.5px] font-semibold transition-colors cursor-pointer',
    secondaryActionBtnClass:
      'px-2 py-1 rounded bg-black hover:bg-[#151a24] border border-white/14 text-[10.5px] text-[#cbd2df] cursor-pointer',
    footerBtnPadClass: 'px-2 py-1 text-[10px] leading-normal rounded-md gap-1',
    footerBtnCompactPadClass: 'px-2 py-1 text-[9.5px] leading-normal rounded-md gap-1',
    footerBtnIconClass: 'w-3 h-3',
    showVerboseCopy: true,
  },
  // Tier 5: MD-LG (240px unified column — large tablet / compact laptop)
  {
    index: 5,
    minWidthPx: 242,
    minWideWidthPx: 214,
    minHeightPx: 430,
    minTreeHeightPx: 470,
    portraitWidthPx: 240,
    compactPortraitWidthPx: 212,
    asidePositionClass: 'top-7 right-3',
    asideWidthClass: 'w-[240px]',
    asideWideWidthClass: 'w-[212px]',
    portraitWidthClass: 'w-[240px]',
    compactPortraitWidthClass: 'w-[212px]',
    cardShellClass: 'rounded-xl px-3 py-2.5',
    titleTextClass: 'text-xs leading-normal',
    tagTextClass: 'text-[11px] leading-snug',
    bodyQuoteClass: 'mt-2 text-xs leading-relaxed break-words text-[#e6e1d6]',
    sectionDividerClass: 'mt-2 pt-2 border-t border-white/10',
    treeMaxHeightClass: 'rounded-xl p-3',
    simChipListClass: 'mt-2 gap-1',
    iconSmClass: 'w-3.5 h-3.5',
    iconBtnPadClass: 'p-1.5',
    primaryActionBtnClass:
      'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] text-[11.5px] font-semibold transition-colors cursor-pointer',
    secondaryActionBtnClass:
      'px-2.5 py-1.5 rounded bg-black hover:bg-[#151a24] border border-white/14 text-[11.5px] text-[#cbd2df] cursor-pointer',
    footerBtnPadClass: 'px-2.5 py-1.5 text-[11px] leading-normal rounded-md gap-1',
    footerBtnCompactPadClass: 'px-2 py-1 text-[10.5px] leading-normal rounded-md gap-1',
    footerBtnIconClass: 'w-3.5 h-3.5',
    showVerboseCopy: true,
  },
  // Tier 6: LG (272px unified column)
  {
    index: 6,
    minWidthPx: 274,
    minWideWidthPx: 242,
    minHeightPx: 486,
    minTreeHeightPx: 526,
    portraitWidthPx: 272,
    compactPortraitWidthPx: 240,
    asidePositionClass: 'top-8 right-3.5',
    asideWidthClass: 'w-[272px]',
    asideWideWidthClass: 'w-[240px]',
    portraitWidthClass: 'w-[272px]',
    compactPortraitWidthClass: 'w-[240px]',
    cardShellClass: 'rounded-xl px-3.5 py-3',
    titleTextClass: 'text-[12.5px] leading-normal',
    tagTextClass: 'text-[11px] leading-snug',
    bodyQuoteClass: 'mt-2 text-[12.5px] leading-relaxed break-words text-[#e6e1d6]',
    sectionDividerClass: 'mt-2.5 pt-2 border-t border-white/10',
    treeMaxHeightClass: 'rounded-xl p-3.5',
    simChipListClass: 'mt-2.5 gap-1',
    iconSmClass: 'w-3.5 h-3.5',
    iconBtnPadClass: 'p-1.5',
    primaryActionBtnClass:
      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] text-xs font-semibold transition-colors cursor-pointer',
    secondaryActionBtnClass:
      'px-2.5 py-1.5 rounded bg-black hover:bg-[#151a24] border border-white/14 text-xs text-[#cbd2df] cursor-pointer',
    footerBtnPadClass: 'px-2.5 py-1.5 text-[11.5px] leading-normal rounded-md gap-1.5',
    footerBtnCompactPadClass: 'px-2 py-1 text-[11px] leading-normal rounded-md gap-1',
    footerBtnIconClass: 'w-3.5 h-3.5',
    showVerboseCopy: true,
  },
  // Tier 7: XL (306px unified column)
  {
    index: 7,
    minWidthPx: 308,
    minWideWidthPx: 272,
    minHeightPx: 540,
    minTreeHeightPx: 584,
    portraitWidthPx: 306,
    compactPortraitWidthPx: 270,
    asidePositionClass: 'top-8 right-3.5',
    asideWidthClass: 'w-[306px]',
    asideWideWidthClass: 'w-[270px]',
    portraitWidthClass: 'w-[306px]',
    compactPortraitWidthClass: 'w-[270px]',
    cardShellClass: 'rounded-xl px-4 py-3',
    titleTextClass: 'text-[13px] leading-normal',
    tagTextClass: 'text-xs leading-snug',
    bodyQuoteClass: 'mt-2 text-[13px] leading-relaxed break-words text-[#e6e1d6]',
    sectionDividerClass: 'mt-2.5 pt-2.5 border-t border-white/10',
    treeMaxHeightClass: 'rounded-xl p-4',
    simChipListClass: 'mt-2.5 gap-1',
    iconSmClass: 'w-4 h-4',
    iconBtnPadClass: 'p-1.5',
    primaryActionBtnClass:
      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] text-xs font-semibold transition-colors cursor-pointer',
    secondaryActionBtnClass:
      'px-2.5 py-1.5 rounded bg-black hover:bg-[#151a24] border border-white/14 text-xs text-[#cbd2df] cursor-pointer',
    footerBtnPadClass: 'px-3 py-1.5 text-xs leading-normal rounded-md gap-1.5',
    footerBtnCompactPadClass: 'px-2.5 py-1.5 text-xs leading-normal rounded-md gap-1.5',
    footerBtnIconClass: 'w-3.5 h-3.5',
    showVerboseCopy: true,
  },
  // Tier 8: 2XL (342px unified column)
  {
    index: 8,
    minWidthPx: 344,
    minWideWidthPx: 302,
    minHeightPx: 594,
    minTreeHeightPx: 642,
    portraitWidthPx: 342,
    compactPortraitWidthPx: 300,
    asidePositionClass: 'top-8 right-3.5',
    asideWidthClass: 'w-[342px]',
    asideWideWidthClass: 'w-[300px]',
    portraitWidthClass: 'w-[342px]',
    compactPortraitWidthClass: 'w-[300px]',
    cardShellClass: 'rounded-xl px-4 py-3.5',
    titleTextClass: 'text-sm leading-normal',
    tagTextClass: 'text-xs leading-snug',
    bodyQuoteClass: 'mt-2 text-sm leading-relaxed break-words text-[#e6e1d6]',
    sectionDividerClass: 'mt-3 pt-2.5 border-t border-white/10',
    treeMaxHeightClass: 'rounded-xl p-4',
    simChipListClass: 'mt-2.5 gap-1.5',
    iconSmClass: 'w-4 h-4',
    iconBtnPadClass: 'p-1.5',
    primaryActionBtnClass:
      'inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] text-[13px] font-semibold transition-colors cursor-pointer',
    secondaryActionBtnClass:
      'px-3 py-2 rounded bg-black hover:bg-[#151a24] border border-white/14 text-[13px] text-[#cbd2df] cursor-pointer',
    footerBtnPadClass: 'px-3 py-1.5 text-[13px] leading-normal rounded-md gap-1.5',
    footerBtnCompactPadClass: 'px-2.5 py-1.5 text-xs leading-normal rounded-md gap-1.5',
    footerBtnIconClass: 'w-4 h-4',
    showVerboseCopy: true,
  },
  // Tier 9: 3XL (380px unified column)
  {
    index: 9,
    minWidthPx: 382,
    minWideWidthPx: 334,
    minHeightPx: 650,
    minTreeHeightPx: 700,
    portraitWidthPx: 380,
    compactPortraitWidthPx: 332,
    asidePositionClass: 'top-8 right-4',
    asideWidthClass: 'w-[380px]',
    asideWideWidthClass: 'w-[332px]',
    portraitWidthClass: 'w-[380px]',
    compactPortraitWidthClass: 'w-[332px]',
    cardShellClass: 'rounded-xl px-4.5 py-4',
    titleTextClass: 'text-[15px] leading-normal',
    tagTextClass: 'text-[13px] leading-snug',
    bodyQuoteClass: 'mt-2.5 text-[14.5px] leading-relaxed break-words text-[#e6e1d6]',
    sectionDividerClass: 'mt-3 pt-3 border-t border-white/10',
    treeMaxHeightClass: 'rounded-xl p-4',
    simChipListClass: 'mt-3 gap-1.5',
    iconSmClass: 'w-4 h-4',
    iconBtnPadClass: 'p-2',
    primaryActionBtnClass:
      'inline-flex items-center gap-2 px-4 py-2 rounded bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] text-[13.5px] font-semibold transition-colors cursor-pointer',
    secondaryActionBtnClass:
      'px-3.5 py-2 rounded bg-black hover:bg-[#151a24] border border-white/14 text-[13.5px] text-[#cbd2df] cursor-pointer',
    footerBtnPadClass: 'px-3.5 py-2 text-[13.5px] leading-normal rounded-md gap-1.5',
    footerBtnCompactPadClass: 'px-3 py-1.5 text-[13px] leading-normal rounded-md gap-1.5',
    footerBtnIconClass: 'w-4 h-4',
    showVerboseCopy: true,
  },
  // Tier 10: 4XL (420px unified column)
  {
    index: 10,
    minWidthPx: 422,
    minWideWidthPx: 366,
    minHeightPx: 708,
    minTreeHeightPx: 758,
    portraitWidthPx: 420,
    compactPortraitWidthPx: 364,
    asidePositionClass: 'top-8 right-4',
    asideWidthClass: 'w-[420px]',
    asideWideWidthClass: 'w-[364px]',
    portraitWidthClass: 'w-[420px]',
    compactPortraitWidthClass: 'w-[364px]',
    cardShellClass: 'rounded-2xl px-5 py-4',
    titleTextClass: 'text-[15.5px] leading-normal',
    tagTextClass: 'text-[13.5px] leading-snug',
    bodyQuoteClass: 'mt-2.5 text-[15px] leading-relaxed break-words text-[#e6e1d6]',
    sectionDividerClass: 'mt-3 pt-3 border-t border-white/10',
    treeMaxHeightClass: 'rounded-2xl p-5',
    simChipListClass: 'mt-3 gap-1.5',
    iconSmClass: 'w-4.5 h-4.5',
    iconBtnPadClass: 'p-2',
    primaryActionBtnClass:
      'inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] text-sm font-semibold transition-colors cursor-pointer',
    secondaryActionBtnClass:
      'px-3.5 py-2 rounded-md bg-black hover:bg-[#151a24] border border-white/14 text-sm text-[#cbd2df] cursor-pointer',
    footerBtnPadClass: 'px-4 py-2 text-sm leading-normal rounded-md gap-2',
    footerBtnCompactPadClass: 'px-3.5 py-2 text-[13.5px] leading-normal rounded-md gap-1.5',
    footerBtnIconClass: 'w-4 h-4',
    showVerboseCopy: true,
  },
  // Tier 11: 5XL (462px unified column)
  {
    index: 11,
    minWidthPx: 464,
    minWideWidthPx: 398,
    minHeightPx: 766,
    minTreeHeightPx: 816,
    portraitWidthPx: 462,
    compactPortraitWidthPx: 396,
    asidePositionClass: 'top-8 right-4',
    asideWidthClass: 'w-[462px]',
    asideWideWidthClass: 'w-[396px]',
    portraitWidthClass: 'w-[462px]',
    compactPortraitWidthClass: 'w-[396px]',
    cardShellClass: 'rounded-2xl px-5 py-4',
    titleTextClass: 'text-base leading-normal',
    tagTextClass: 'text-sm leading-snug',
    bodyQuoteClass: 'mt-2.5 text-[15.5px] leading-relaxed break-words text-[#e6e1d6]',
    sectionDividerClass: 'mt-3 pt-3 border-t border-white/10',
    treeMaxHeightClass: 'rounded-2xl p-5',
    simChipListClass: 'mt-3 gap-1.5',
    iconSmClass: 'w-4.5 h-4.5',
    iconBtnPadClass: 'p-2',
    primaryActionBtnClass:
      'inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] text-sm font-semibold transition-colors cursor-pointer',
    secondaryActionBtnClass:
      'px-3.5 py-2 rounded-md bg-black hover:bg-[#151a24] border border-white/14 text-sm text-[#cbd2df] cursor-pointer',
    footerBtnPadClass: 'px-4 py-2 text-sm leading-normal rounded-md gap-2',
    footerBtnCompactPadClass: 'px-3.5 py-2 text-sm leading-normal rounded-md gap-1.5',
    footerBtnIconClass: 'w-4.5 h-4.5',
    showVerboseCopy: true,
  },
  // Tier 12: 6XL (508px unified column)
  {
    index: 12,
    minWidthPx: 510,
    minWideWidthPx: 428,
    minHeightPx: 828,
    minTreeHeightPx: 874,
    portraitWidthPx: 508,
    compactPortraitWidthPx: 426,
    asidePositionClass: 'top-8 right-4',
    asideWidthClass: 'w-[508px]',
    asideWideWidthClass: 'w-[426px]',
    portraitWidthClass: 'w-[508px]',
    compactPortraitWidthClass: 'w-[426px]',
    cardShellClass: 'rounded-2xl px-5 py-4',
    titleTextClass: 'text-base leading-normal',
    tagTextClass: 'text-sm leading-snug',
    bodyQuoteClass: 'mt-2.5 text-base leading-relaxed break-words text-[#e6e1d6]',
    sectionDividerClass: 'mt-3 pt-3 border-t border-white/10',
    treeMaxHeightClass: 'rounded-2xl p-5',
    simChipListClass: 'mt-3 gap-1.5',
    iconSmClass: 'w-4.5 h-4.5',
    iconBtnPadClass: 'p-2',
    primaryActionBtnClass:
      'inline-flex items-center gap-2 px-4.5 py-2 rounded-md bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] text-sm font-semibold transition-colors cursor-pointer',
    secondaryActionBtnClass:
      'px-4 py-2 rounded-md bg-black hover:bg-[#151a24] border border-white/14 text-sm text-[#cbd2df] cursor-pointer',
    footerBtnPadClass: 'px-4 py-2 text-sm leading-normal rounded-md gap-2',
    footerBtnCompactPadClass: 'px-3.5 py-2 text-sm leading-normal rounded-md gap-1.5',
    footerBtnIconClass: 'w-4.5 h-4.5',
    showVerboseCopy: true,
  },
  // Tier 13: 7XL (554px unified column — Full Native 554×740 portrait video + 554px modal below)
  {
    index: 13,
    minWidthPx: 556,
    minWideWidthPx: 458,
    minHeightPx: 882,
    minTreeHeightPx: 924,
    portraitWidthPx: 554,
    compactPortraitWidthPx: 456,
    asidePositionClass: 'top-8 right-4',
    asideWidthClass: 'w-[554px]',
    asideWideWidthClass: 'w-[456px]',
    portraitWidthClass: 'w-[554px]',
    compactPortraitWidthClass: 'w-[456px]',
    cardShellClass: 'rounded-2xl px-5 py-3.5',
    titleTextClass: 'text-base leading-normal',
    tagTextClass: 'text-sm leading-snug',
    bodyQuoteClass: 'mt-2 text-base leading-relaxed break-words text-[#e6e1d6]',
    sectionDividerClass: 'mt-2.5 pt-2.5 border-t border-white/10',
    treeMaxHeightClass: 'rounded-2xl p-5',
    simChipListClass: 'mt-3 gap-1.5',
    iconSmClass: 'w-4.5 h-4.5',
    iconBtnPadClass: 'p-2',
    primaryActionBtnClass:
      'inline-flex items-center gap-2 px-4.5 py-2 rounded-md bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] text-sm font-semibold transition-colors cursor-pointer',
    secondaryActionBtnClass:
      'px-4 py-2 rounded-md bg-black hover:bg-[#151a24] border border-white/14 text-sm text-[#cbd2df] cursor-pointer',
    footerBtnPadClass: 'px-4 py-2 text-sm leading-normal rounded-md gap-2',
    footerBtnCompactPadClass: 'px-3.5 py-2 text-sm leading-normal rounded-md gap-1.5',
    footerBtnIconClass: 'w-4.5 h-4.5',
    showVerboseCopy: true,
  },
];

export function selectMatchedAngelTierIndex(
  voidSpec: UpperRightVoidSpec,
  isWideCard: boolean,
): number {
  if (!voidSpec.hasVoidSpace) {
    return 0;
  }

  for (let i = ANGEL_VOID_SIZE_TIERS.length - 1; i >= 1; i--) {
    const t = ANGEL_VOID_SIZE_TIERS[i];
    const reqW = isWideCard ? t.minWideWidthPx : t.minWidthPx;
    const reqH = isWideCard ? t.minTreeHeightPx : t.minHeightPx;
    if (voidSpec.targetWidthPx >= reqW && voidSpec.targetHeightPx >= reqH) {
      return i;
    }
  }
  return 0;
}

export function selectAngelVoidSizeTier(
  voidSpec: UpperRightVoidSpec,
  isWideCard: boolean,
  downgradeSteps = 0,
): AngelVoidTierClasses {
  const matchedIdx = selectMatchedAngelTierIndex(voidSpec, isWideCard);
  if (matchedIdx <= 0) {
    return ANGEL_VOID_SIZE_TIERS[0];
  }

  // Allow proportional unified video + modal step-down whenever an unclipped multi-line modal
  // needs vertical room so 100% of the modal's content is always shown on screen.
  const safeSteps = Math.max(0, downgradeSteps);
  const finalIdx = Math.max(0, matchedIdx - safeSteps);
  return ANGEL_VOID_SIZE_TIERS[finalIdx];
}
