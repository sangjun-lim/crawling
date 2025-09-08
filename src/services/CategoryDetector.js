import categoryKeywords from '../config/categories.js';

class CategoryDetector {
  constructor() {
    this.categoryKeywords = categoryKeywords;
  }

  detectCategory(keyword) {
    for (const [category, keywords] of Object.entries(this.categoryKeywords)) {
      if (keywords.some(kw => keyword.includes(kw))) {
        console.log(`검색어 "${keyword}" → 카테고리: ${category}`);
        return category;
      }
    }
    console.log(`검색어 "${keyword}" → 카테고리: place (기본값)`);
    return 'place';
  }
}

export default CategoryDetector;