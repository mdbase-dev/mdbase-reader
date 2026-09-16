import { annotationBodyText } from "@mdbase-reader/core";

export interface AnnotationImageEmbed {
  readonly path: string;
  readonly alt: string;
}

export interface AnnotationBodyContent {
  readonly images: readonly AnnotationImageEmbed[];
  readonly quote: string | null;
  readonly note: string;
}

const embeddedWikilink = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/gu;
const imageExtension = /\.(?:avif|gif|jpe?g|png|webp)$/iu;

export function annotationBodyContent(body: string): AnnotationBodyContent {
  const images: AnnotationImageEmbed[] = [];
  const withoutImages = body.replace(
    embeddedWikilink,
    (embed, rawPath: string, rawAlt?: string) => {
      const path = rawPath.trim();
      if (!imageExtension.test(path)) {
        return embed;
      }
      const alt = rawAlt?.trim();
      images.push({ path, alt: alt?.length ? alt : "Screenshot highlight" });
      return "";
    },
  );
  const text = annotationBodyText(withoutImages);
  return {
    images,
    quote: text.quote,
    note: text.note,
  };
}
