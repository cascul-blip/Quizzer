/** Generated Christmas pictures for Sled Squad's trail challenge. */
import { glyphId, parseGlyph } from "../../shared/glyphs.ts";
import treeStarBaubles from "./winter/symbols/tree-star-baubles.webp";
import treeBowBaubles from "./winter/symbols/tree-bow-baubles.webp";
import treeStarGarland from "./winter/symbols/tree-star-garland.webp";
import treeBells from "./winter/symbols/tree-bells.webp";
import treeSnow from "./winter/symbols/tree-snow.webp";
import treeStarBow from "./winter/symbols/tree-star-bow.webp";
import giftSquare from "./winter/symbols/gift-square.webp";
import giftTall from "./winter/symbols/gift-tall.webp";
import giftHolly from "./winter/symbols/gift-holly.webp";
import giftRound from "./winter/symbols/gift-round.webp";
import giftDots from "./winter/symbols/gift-dots.webp";
import giftHeart from "./winter/symbols/gift-heart.webp";
import stockingRight from "./winter/symbols/stocking-right.webp";
import stockingLeft from "./winter/symbols/stocking-left.webp";
import stockingStar from "./winter/symbols/stocking-star.webp";
import stockingDots from "./winter/symbols/stocking-dots.webp";
import stockingStripes from "./winter/symbols/stocking-stripes.webp";
import stockingTree from "./winter/symbols/stocking-tree.webp";
import wreathBottomBow from "./winter/symbols/wreath-bottom-bow.webp";
import wreathTopBow from "./winter/symbols/wreath-top-bow.webp";
import wreathBells from "./winter/symbols/wreath-bells.webp";
import wreathStar from "./winter/symbols/wreath-star.webp";
import wreathCandyCanes from "./winter/symbols/wreath-candy-canes.webp";
import wreathSnowflake from "./winter/symbols/wreath-snowflake.webp";

const pictures: Record<string, string> = {
  "christmas:tree:star-baubles": treeStarBaubles,
  "christmas:tree:bow-baubles": treeBowBaubles,
  "christmas:tree:star-garland": treeStarGarland,
  "christmas:tree:bells": treeBells,
  "christmas:tree:snow": treeSnow,
  "christmas:tree:star-bow": treeStarBow,
  "christmas:gift:square": giftSquare,
  "christmas:gift:tall": giftTall,
  "christmas:gift:holly": giftHolly,
  "christmas:gift:round": giftRound,
  "christmas:gift:dots": giftDots,
  "christmas:gift:heart": giftHeart,
  "christmas:stocking:right": stockingRight,
  "christmas:stocking:left": stockingLeft,
  "christmas:stocking:star": stockingStar,
  "christmas:stocking:dots": stockingDots,
  "christmas:stocking:stripes": stockingStripes,
  "christmas:stocking:tree": stockingTree,
  "christmas:wreath:bottom-bow": wreathBottomBow,
  "christmas:wreath:top-bow": wreathTopBow,
  "christmas:wreath:bells": wreathBells,
  "christmas:wreath:star": wreathStar,
  "christmas:wreath:candy-canes": wreathCandyCanes,
  "christmas:wreath:snowflake": wreathSnowflake,
};

export function GlyphSymbol({ id }: { id: string }) {
  const glyph = parseGlyph(id);
  if (!glyph) return null;
  // Describing the picture is the instructor's job; keep the accessible name neutral.
  return <img class="sea-symbol" src={pictures[glyphId(glyph)]} alt="Christmas symbol" draggable={false} />;
}
