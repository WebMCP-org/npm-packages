import { expectTypeOf } from 'vitest';
import type { ReactElement } from 'react';
import type {} from './index.js';

const declarativeForm = (
  <form
    toolname="search_catalog"
    tooltitle="Search catalog"
    tooldescription="Search the product catalog"
    toolautosubmit=""
  >
    <fieldset toolparamdescription="Search filters">
      <input name="query" toolparamdescription="Words to match" />
      <select name="category" toolparamdescription="Category to search">
        <option value="books">Books</option>
      </select>
      <textarea name="notes" toolparamdescription="Optional notes" />
    </fieldset>
  </form>
);

expectTypeOf(declarativeForm).toMatchTypeOf<ReactElement>();

// @ts-expect-error React drops true-valued unknown attributes instead of rendering them.
const booleanAutosubmit = <form toolautosubmit />;
void booleanAutosubmit;
