export const productosMocks = {
  assertStockDisponibleParaLineas: jest.fn().mockResolvedValue(undefined),
  updateStock: jest.fn().mockResolvedValue(undefined),
};

export class ProductosService {
  assertStockDisponibleParaLineas = productosMocks.assertStockDisponibleParaLineas;
  updateStock = productosMocks.updateStock;
}
