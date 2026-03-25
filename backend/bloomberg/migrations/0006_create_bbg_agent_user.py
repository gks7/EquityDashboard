"""
Create the bbg_agent service account for the Bloomberg Agent.
"""
from django.db import migrations
from django.contrib.auth.hashers import make_password


def create_agent_user(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    if not User.objects.filter(username='bbg_agent').exists():
        User.objects.create(
            username='bbg_agent',
            password=make_password('FractalBBG2026!'),
            is_staff=True,
            is_active=True,
            is_superuser=False,
            email='bbg_agent@igfwm.com',
            first_name='BBG',
            last_name='Agent',
        )


def remove_agent_user(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    User.objects.filter(username='bbg_agent').delete()


class Migration(migrations.Migration):
    dependencies = [
        ('bloomberg', '0005_load_initial_data'),
        ('auth', '__latest__'),
    ]

    operations = [
        migrations.RunPython(create_agent_user, remove_agent_user),
    ]
