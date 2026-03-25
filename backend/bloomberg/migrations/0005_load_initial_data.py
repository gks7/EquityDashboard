"""
Data migration: widen country field, then load Bloomberg data from fixture.
"""
import os
from django.db import migrations, models
from django.core.management import call_command


def load_fixture(apps, schema_editor):
    fixture_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        'fixtures', 'bloomberg_data.json'
    )
    if os.path.exists(fixture_path):
        call_command('loaddata', fixture_path, verbosity=1)


def reverse_load(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('bloomberg', '0004_add_position_snapshot'),
    ]

    operations = [
        # Widen country field BEFORE loading data (South Korea = 11 chars > old max 10)
        migrations.AlterField(
            model_name='bloombergasset',
            name='country',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        # Now load the fixture
        migrations.RunPython(load_fixture, reverse_load),
    ]
