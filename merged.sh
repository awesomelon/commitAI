#!/bin/bash

# 작업 디렉토리로 이동
cd /Users/bangjaeho/project/side-project/autocommit

# merged.md 파일 생성 (기존 파일이 있다면 내용을 덮어씁니다)
> merged.md


# src와 tests 폴더의 .ts 파일을 찾아서 처리
for folder in src; do
    # 폴더 이름을 merged.md에 추가
    echo "# ${folder} 폴더" >> merged.md
    echo "" >> merged.md

    # 해당 폴더의 모든 .ts 파일을 찾아서 처리
    for file in $(find ./${folder} -name "*.ts" | sort); do
        # 파일 경로를 merged.md에 추가
        echo "\`\`\`ts" >> merged.md
        echo "/* ${file} */" >> merged.md

        # 파일 내용을 merged.md에 추가
        cat "$file" >> merged.md

        # 코드 블록 종료
        echo "\`\`\`" >> merged.md

        # 파일 사이에 빈 줄 추가
        echo "" >> merged.md
    done

    # 해당 폴더의 모든 .tsx 파일을 찾아서 처리
    for file in $(find ./${folder} -name "*.tsx" | sort); do
        # 파일 경로를 merged.md에 추가
        echo "\`\`\`tsx" >> merged.md
        echo "/* ${file} */" >> merged.md

        # 파일 내용을 merged.md에 추가
        cat "$file" >> merged.md

        # 코드 블록 종료
        echo "\`\`\`" >> merged.md

        # 파일 사이에 빈 줄 추가
        echo "" >> merged.md
    done
done

echo "HTML, src 폴더의 모든 .ts 및 css 파일이 경로와 함께 merged.md로 합쳐졌습니다."
