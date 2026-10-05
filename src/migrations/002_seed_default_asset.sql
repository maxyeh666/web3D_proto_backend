INSERT INTO assets(name, config)
VALUES (
    'Default Cube',
    '{
        "camera": {
            "position": [3, 5, 5],
            "fov": 60
        },
        "cube": {
            "color": "#999999"
        }
    }'::jsonb
)