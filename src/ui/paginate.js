// The rows of one page: { visible, pages, current }.
export const paginate = (list, page, size) => {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { visible: list.slice((current - 1) * size, current * size), pages, current };
};

