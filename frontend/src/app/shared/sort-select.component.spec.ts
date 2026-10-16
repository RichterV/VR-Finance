import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';

import { SortSelectComponent } from './sort-select.component';
import { DEFAULT_SORT_KEY, UNSORTED } from './sortable';

function setup(state = UNSORTED) {
  TestBed.configureTestingModule({ providers: [provideIonicAngular()] });
  const fixture = TestBed.createComponent(SortSelectComponent);
  fixture.componentInstance.options = [
    { value: DEFAULT_SORT_KEY, label: 'Mais recentes' },
    { value: 'value:desc', label: 'Maior valor' },
  ];
  fixture.componentInstance.state = state;
  fixture.detectChanges();
  return fixture;
}

describe('SortSelectComponent', () => {
  it('shows the default key when the list is unsorted', () => {
    expect(setup().componentInstance.key).toBe(DEFAULT_SORT_KEY);
  });

  it('reflects a sort state coming from the table headers', () => {
    expect(setup({ column: 'value', direction: 'desc' }).componentInstance.key).toBe('value:desc');
  });

  it('emits the parsed SortState when an option is picked', () => {
    const fixture = setup();
    const spy = vi.fn();
    fixture.componentInstance.stateChange.subscribe(spy);

    fixture.componentInstance.onChange('value:desc');
    fixture.componentInstance.onChange(DEFAULT_SORT_KEY);

    expect(spy).toHaveBeenNthCalledWith(1, { column: 'value', direction: 'desc' });
    expect(spy).toHaveBeenNthCalledWith(2, UNSORTED);
  });
});
