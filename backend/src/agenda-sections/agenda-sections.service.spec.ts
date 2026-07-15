import { NotFoundException } from "@nestjs/common";
import { AgendaSection } from "./agenda-section.entity";
import { AgendaSectionsService } from "./agenda-sections.service";

describe("AgendaSectionsService", () => {
  const repository = {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findOneBy: jest.fn(),
    delete: jest.fn(),
  };
  const service = new AgendaSectionsService(repository as any);
  beforeEach(() => jest.clearAllMocks());
  it("lists sections in position order", async () => {
    repository.find.mockResolvedValue([]);
    await service.findAll();
    expect(repository.find).toHaveBeenCalledWith({
      order: { position: "ASC" },
    });
  });
  it("creates and saves a section", async () => {
    const section = { id: "section" } as AgendaSection;
    repository.create.mockReturnValue(section);
    repository.save.mockResolvedValue(section);
    await expect(
      service.create({ name: "Start", position: 1, isDefault: true }),
    ).resolves.toBe(section);
  });
  it("merges updates into an existing section", async () => {
    const section = { id: "section", name: "Old" } as AgendaSection;
    repository.findOneBy.mockResolvedValue(section);
    repository.save.mockImplementation(async (v: AgendaSection) => v);
    await expect(
      service.update("section", { name: "New", position: 2, isDefault: false }),
    ).resolves.toMatchObject({ name: "New", position: 2 });
  });
  it("rejects missing updates and removals", async () => {
    repository.findOneBy.mockResolvedValue(null);
    await expect(service.update("x", {} as any)).rejects.toThrow(
      NotFoundException,
    );
    repository.delete.mockResolvedValue({ affected: 0 });
    await expect(service.remove("x")).rejects.toThrow(NotFoundException);
  });
  it("removes an existing section", async () => {
    repository.delete.mockResolvedValue({ affected: 1 });
    await expect(service.remove("section")).resolves.toBeUndefined();
    expect(repository.delete).toHaveBeenCalledWith("section");
  });
});
