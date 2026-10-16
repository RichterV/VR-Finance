import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import { of, throwError } from 'rxjs';

import { AttachmentsService } from '../../services/attachments.service';
import { DropdownOption, DropdownOptionsService } from '../../services/dropdown-options.service';
import { GastosService } from '../../services/gastos.service';
import { CategoryQuickAddComponent, NEW_CATEGORY_OPTION } from '../../shared/category-quick-add.component';
import { AdicionarGastoModalComponent } from './adicionar-gasto-modal.component';

function option(id: number, name: string): DropdownOption {
  return { id, priority: 'essencial', name, active: true, include_in_inflation: false };
}

describe('AdicionarGastoModalComponent (nova categoria na hora)', () => {
  let fixture: ComponentFixture<AdicionarGastoModalComponent>;
  let component: AdicionarGastoModalComponent;
  let createCategorySpy: ReturnType<typeof vi.fn>;

  function quickAdd(): CategoryQuickAddComponent {
    fixture.detectChanges();
    return fixture.debugElement.query((el) => el.componentInstance instanceof CategoryQuickAddComponent)
      .componentInstance as CategoryQuickAddComponent;
  }

  beforeEach(() => {
    createCategorySpy = vi.fn(() => of(option(5, 'Farmácia')));
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        {
          provide: DropdownOptionsService,
          useValue: { list: () => of([option(1, 'Casa'), option(2, 'Mercado')]), create: createCategorySpy },
        },
        { provide: GastosService, useValue: { create: vi.fn() } },
        { provide: AttachmentsService, useValue: { upload: vi.fn(), list: () => of([]), remove: () => of(undefined) } },
      ],
    });
    fixture = TestBed.createComponent(AdicionarGastoModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('choosing "+ Nova categoria" opens the create field and keeps the previous category', () => {
    component.form.controls.itemId.setValue(2);
    component.form.controls.itemId.setValue(NEW_CATEGORY_OPTION);

    expect(component.creatingCategory()).toBe(true);
    expect(component.form.controls.itemId.value).toBe(2);
  });

  it('creates the category in the current priority and selects it', () => {
    component.form.controls.itemId.setValue(NEW_CATEGORY_OPTION);
    const field = quickAdd();
    field.onInput('  Farmácia ');
    field.create();

    expect(createCategorySpy).toHaveBeenCalledWith('essencial', 'Farmácia');
    expect(component.creatingCategory()).toBe(false);
    expect(component.form.controls.itemId.value).toBe(5);
    expect(component.items().map((i) => i.name)).toEqual(['Casa', 'Farmácia', 'Mercado']);
  });

  it('selects the existing category instead of creating a duplicate', () => {
    component.form.controls.itemId.setValue(NEW_CATEGORY_OPTION);
    const field = quickAdd();
    field.onInput('mercado');
    field.create();

    expect(createCategorySpy).not.toHaveBeenCalled();
    expect(component.form.controls.itemId.value).toBe(2);
  });

  it('shows the backend error and stays open', () => {
    createCategorySpy.mockReturnValue(throwError(() => ({ status: 400, error: { detail: 'Já existe a categoria "Luz".' } })));
    component.form.controls.itemId.setValue(NEW_CATEGORY_OPTION);
    const field = quickAdd();
    field.onInput('Luz');
    field.create();

    expect(field.error()).toBe('Já existe a categoria "Luz".');
    expect(component.creatingCategory()).toBe(true);
  });

  it('empty name asks for one without calling the backend', () => {
    component.form.controls.itemId.setValue(NEW_CATEGORY_OPTION);
    const field = quickAdd();
    field.create();

    expect(field.error()).toBe('Digite o nome da categoria.');
    expect(createCategorySpy).not.toHaveBeenCalled();
  });
});
